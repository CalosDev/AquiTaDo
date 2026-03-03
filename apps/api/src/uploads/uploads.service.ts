import { Injectable, Inject, BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationRole } from '../generated/prisma/client';

type StorageProvider = 'local' | 's3';
type StoredAsset = {
    url: string;
    localPath?: string;
    objectKey?: string;
};

@Injectable()
export class UploadsService {
    private readonly logger = new Logger(UploadsService.name);
    private sharpLoadFailed = false;
    private s3Client: S3Client | null = null;

    constructor(
        @Inject(PrismaService)
        private prisma: PrismaService,
    ) { }

    private readonly allowedMimeTypes: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
    };
    private readonly uploadsRoot = path.resolve(process.cwd(), 'uploads');

    async uploadBusinessImage(
        file: Express.Multer.File,
        businessId: string,
        _userId: string,
        userRole: string,
        organizationId: string,
        organizationRole: OrganizationRole,
    ) {
        const extension = this.allowedMimeTypes[file.mimetype];
        if (!extension) {
            throw new BadRequestException('Formato de imagen no permitido');
        }

        const business = await this.prisma.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                ownerId: true,
                organizationId: true,
            },
        });

        if (!business) {
            throw new BadRequestException('Negocio no encontrado');
        }

        if (userRole !== 'ADMIN') {
            if (business.organizationId !== organizationId) {
                throw new NotFoundException('Negocio no encontrado');
            }

            if (organizationRole === 'STAFF') {
                throw new ForbiddenException('No tienes permisos para subir imagenes a este negocio');
            }
        }

        const imageCount = await this.prisma.businessImage.count({
            where: { businessId },
        });

        const maxImagesPerBusiness = await this.resolveMaxImagesPerBusiness(
            business.organizationId,
        );

        if (
            maxImagesPerBusiness !== null &&
            imageCount >= maxImagesPerBusiness
        ) {
            throw new BadRequestException(
                `El negocio ya tiene el maximo de ${maxImagesPerBusiness} imagenes para su plan`,
            );
        }

        const storedAsset = await this.storeBusinessImageAsset(
            file.buffer,
            file.mimetype,
            businessId,
            extension,
        );

        try {
            return await this.prisma.businessImage.create({
                data: {
                    url: storedAsset.url,
                    businessId,
                },
            });
        } catch (error) {
            await this.deleteStoredAsset(storedAsset).catch(() => undefined);
            throw error;
        }
    }

    async deleteBusinessImage(
        imageId: string,
        _userId: string,
        userRole: string,
        organizationId: string,
        organizationRole: OrganizationRole,
    ) {
        const image = await this.prisma.businessImage.findUnique({
            where: { id: imageId },
            include: {
                business: {
                    select: { ownerId: true, organizationId: true },
                },
            },
        });

        if (!image) {
            throw new NotFoundException('Imagen no encontrada');
        }

        if (userRole !== 'ADMIN') {
            if (image.business.organizationId !== organizationId) {
                throw new NotFoundException('Imagen no encontrada');
            }

            if (organizationRole === 'STAFF') {
                throw new ForbiddenException('No tienes permisos para eliminar esta imagen');
            }
        }

        await this.prisma.businessImage.delete({
            where: { id: imageId },
        });

        await this.deleteStoredAsset({
            url: image.url,
            localPath: this.resolveUploadPath(image.url) ?? undefined,
            objectKey: this.resolveObjectKeyFromUrl(image.url) ?? undefined,
        }).catch((error) => {
            this.logger.warn(
                `No se pudo eliminar el archivo de imagen (${error instanceof Error ? error.message : String(error)})`,
            );
        });

        return { message: 'Imagen eliminada exitosamente' };
    }

    private async storeBusinessImageAsset(
        sourceBuffer: Buffer,
        mimeType: string,
        businessId: string,
        extension: string,
    ): Promise<StoredAsset> {
        const provider = this.resolveStorageProvider();
        if (provider === 's3') {
            return this.uploadToS3(sourceBuffer, mimeType, businessId, extension);
        }

        return this.storeLocalFile(sourceBuffer, businessId, extension);
    }

    private async storeLocalFile(
        sourceBuffer: Buffer,
        businessId: string,
        extension: string,
    ): Promise<StoredAsset> {
        const uploadsDir = path.join(process.cwd(), 'uploads', 'businesses');
        await fs.mkdir(uploadsDir, { recursive: true });

        const fileName = `${businessId}-${randomUUID()}.${extension}`;
        const filePath = path.join(uploadsDir, fileName);
        await fs.writeFile(filePath, sourceBuffer);
        void this.generateOptimizedVariants(sourceBuffer, filePath);

        return {
            url: `/uploads/businesses/${fileName}`,
            localPath: filePath,
        };
    }

    private async uploadToS3(
        sourceBuffer: Buffer,
        mimeType: string,
        businessId: string,
        extension: string,
    ): Promise<StoredAsset> {
        const s3Client = this.resolveS3Client();
        const bucket = this.resolveS3Bucket();
        const objectKey = `businesses/${businessId}/${randomUUID()}.${extension}`;

        await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            Body: sourceBuffer,
            ContentType: mimeType,
            CacheControl: 'public, max-age=31536000, immutable',
        }));

        return {
            url: this.resolvePublicObjectUrl(bucket, objectKey),
            objectKey,
        };
    }

    private async deleteStoredAsset(asset: StoredAsset): Promise<void> {
        if (asset.localPath) {
            try {
                await fs.unlink(asset.localPath);
                await this.deleteOptimizedSiblings(asset.localPath);
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (code !== 'ENOENT') {
                    throw error;
                }
            }
            return;
        }

        const provider = this.resolveStorageProvider();
        if (provider !== 's3') {
            return;
        }

        const objectKey = asset.objectKey || this.resolveObjectKeyFromUrl(asset.url);
        if (!objectKey) {
            return;
        }

        const s3Client = this.resolveS3Client();
        const bucket = this.resolveS3Bucket();
        await s3Client.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: objectKey,
        }));
    }

    private resolveUploadPath(assetUrl: string): string | null {
        const normalizedAssetUrl = assetUrl.trim();
        if (!normalizedAssetUrl.startsWith('/uploads/')) {
            return null;
        }

        const relativePath = normalizedAssetUrl.replace(/^\/+/, '');
        const absolutePath = path.resolve(process.cwd(), relativePath);
        const relativeToUploadsRoot = path.relative(this.uploadsRoot, absolutePath);

        if (relativeToUploadsRoot.startsWith('..') || path.isAbsolute(relativeToUploadsRoot)) {
            return null;
        }

        return absolutePath;
    }

    private resolveStorageProvider(): StorageProvider {
        const rawProvider = (process.env.STORAGE_PROVIDER || 'local').trim().toLowerCase();
        return rawProvider === 's3' ? 's3' : 'local';
    }

    private resolveS3Client(): S3Client {
        if (this.s3Client) {
            return this.s3Client;
        }

        const region = (process.env.STORAGE_S3_REGION || 'us-east-1').trim();
        const endpoint = process.env.STORAGE_S3_ENDPOINT?.trim();
        const accessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID?.trim();
        const secretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY?.trim();
        const forcePathStyle = ['1', 'true'].includes(
            (process.env.STORAGE_S3_FORCE_PATH_STYLE || 'false').trim().toLowerCase(),
        );

        this.s3Client = new S3Client({
            region,
            ...(endpoint ? { endpoint } : {}),
            ...(forcePathStyle ? { forcePathStyle: true } : {}),
            ...(accessKeyId && secretAccessKey
                ? {
                    credentials: {
                        accessKeyId,
                        secretAccessKey,
                    },
                }
                : {}),
        });
        return this.s3Client;
    }

    private resolveS3Bucket(): string {
        const bucket = process.env.STORAGE_S3_BUCKET?.trim();
        if (!bucket) {
            throw new BadRequestException('STORAGE_S3_BUCKET no esta configurado');
        }
        return bucket;
    }

    private resolvePublicObjectUrl(bucket: string, objectKey: string): string {
        const explicitPublicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL?.trim();
        if (explicitPublicBaseUrl) {
            return `${explicitPublicBaseUrl.replace(/\/+$/, '')}/${objectKey}`;
        }

        const endpoint = process.env.STORAGE_S3_ENDPOINT?.trim();
        if (endpoint) {
            const baseEndpoint = endpoint.replace(/\/+$/, '');
            const forcePathStyle = ['1', 'true'].includes(
                (process.env.STORAGE_S3_FORCE_PATH_STYLE || 'false').trim().toLowerCase(),
            );
            if (forcePathStyle) {
                return `${baseEndpoint}/${bucket}/${objectKey}`;
            }
            return `${baseEndpoint}/${objectKey}`;
        }

        const region = (process.env.STORAGE_S3_REGION || 'us-east-1').trim();
        return `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}`;
    }

    private resolveObjectKeyFromUrl(assetUrl: string): string | null {
        const normalized = assetUrl.trim();
        const publicBase = process.env.STORAGE_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');

        if (publicBase && normalized.startsWith(`${publicBase}/`)) {
            return decodeURIComponent(normalized.slice(publicBase.length + 1));
        }

        try {
            const parsed = new URL(normalized);
            const bucket = this.resolveS3Bucket();
            const pathname = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
            if (pathname.startsWith(`${bucket}/`)) {
                return pathname.slice(bucket.length + 1);
            }
            return pathname || null;
        } catch {
            return null;
        }
    }

    private async resolveMaxImagesPerBusiness(organizationId: string): Promise<number | null> {
        const subscription = await this.prisma.subscription.findUnique({
            where: { organizationId },
            include: {
                plan: {
                    select: {
                        maxImagesPerBusiness: true,
                    },
                },
            },
        });

        if (subscription?.plan) {
            return subscription.plan.maxImagesPerBusiness;
        }

        const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: { plan: true },
        });

        if (!organization) {
            return 10;
        }

        const fallbackPlan = await this.prisma.plan.findUnique({
            where: { code: organization.plan },
            select: {
                maxImagesPerBusiness: true,
            },
        });

        return fallbackPlan?.maxImagesPerBusiness ?? 10;
    }

    private async generateOptimizedVariants(
        sourceBuffer: Buffer,
        originalFilePath: string,
    ): Promise<void> {
        const sharpFactory = await this.resolveSharpFactory();
        if (!sharpFactory) {
            return;
        }

        const basePath = originalFilePath.replace(/\.[^.]+$/, '');
        try {
            await Promise.all([
                sharpFactory(sourceBuffer)
                    .rotate()
                    .resize({
                        width: 1_920,
                        withoutEnlargement: true,
                    })
                    .webp({ quality: 82 })
                    .toFile(`${basePath}.webp`),
                sharpFactory(sourceBuffer)
                    .rotate()
                    .resize({
                        width: 1_920,
                        withoutEnlargement: true,
                    })
                    .avif({ quality: 56 })
                    .toFile(`${basePath}.avif`),
            ]);
        } catch (error) {
            this.logger.warn(
                `No se pudieron generar variantes optimizadas para "${originalFilePath}" (${error instanceof Error ? error.message : String(error)})`,
            );
        }
    }

    private async deleteOptimizedSiblings(originalFilePath: string): Promise<void> {
        const basePath = originalFilePath.replace(/\.[^.]+$/, '');
        const variants = [`${basePath}.webp`, `${basePath}.avif`];
        for (const variantPath of variants) {
            try {
                await fs.unlink(variantPath);
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (code !== 'ENOENT') {
                    throw error;
                }
            }
        }
    }

    private async resolveSharpFactory(): Promise<((input?: Buffer) => import('sharp').Sharp) | null> {
        if (this.sharpLoadFailed) {
            return null;
        }

        try {
            const sharpModule = await import('sharp');
            return sharpModule.default;
        } catch (error) {
            if (!this.sharpLoadFailed) {
                this.sharpLoadFailed = true;
                this.logger.warn(
                    `Sharp no disponible, se omite optimizacion AVIF/WebP (${error instanceof Error ? error.message : String(error)})`,
                );
            }
            return null;
        }
    }
}
