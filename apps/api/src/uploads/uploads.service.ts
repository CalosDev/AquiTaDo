import { Injectable, Inject, BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationRole } from '../generated/prisma/client';
import { UpdateBusinessImageDto } from './dto/update-business-image.dto';

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
        private readonly prisma: PrismaService,
        @Inject(ConfigService)
        private readonly configService: ConfigService,
    ) { }

    private readonly allowedMimeTypes: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
    };
    private readonly allowedDocumentMimeTypes: Record<string, string> = {
        'application/pdf': 'pdf',
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

        if (!business.organizationId) {
            throw new BadRequestException('Este negocio aun no tiene una organizacion activa para gestionar imagenes');
        }

        if (userRole !== 'ADMIN') {
            if (business.organizationId !== organizationId) {
                throw new NotFoundException('Negocio no encontrado');
            }

            if (organizationRole === 'STAFF') {
                throw new ForbiddenException('No tienes permisos para subir imágenes a este negocio');
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
                `El negocio ya tiene el máximo de ${maxImagesPerBusiness} imágenes para su plan`,
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
                    sortOrder: imageCount,
                    isCover: imageCount === 0,
                    type: imageCount === 0 ? 'COVER' : 'GALLERY',
                },
            });
        } catch (error) {
            await this.deleteStoredAsset(storedAsset).catch(() => undefined);
            throw error;
        }
    }

    async uploadUserAvatar(file: Express.Multer.File, userId: string) {
        const extension = this.allowedMimeTypes[file.mimetype];
        if (!extension) {
            throw new BadRequestException('Formato de imagen no permitido');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                avatarUrl: true,
            },
        });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        const storedAsset = await this.storeUserAvatarAsset(
            file.buffer,
            file.mimetype,
            userId,
            extension,
        );

        try {
            const updatedUser = await this.prisma.user.update({
                where: { id: userId },
                data: {
                    avatarUrl: storedAsset.url,
                },
                select: {
                    avatarUrl: true,
                },
            });

            await this.deleteManagedAssetByUrl(user.avatarUrl);
            return updatedUser;
        } catch (error) {
            await this.deleteStoredAsset(storedAsset).catch(() => undefined);
            throw error;
        }
    }

    async uploadVerificationDocument(
        file: Express.Multer.File,
        businessId: string,
        userRole: string,
        organizationId: string,
        organizationRole: OrganizationRole | null,
    ) {
        const extension = this.allowedDocumentMimeTypes[file.mimetype];
        if (!extension) {
            throw new BadRequestException('Formato de documento no permitido');
        }

        const business = await this.prisma.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                organizationId: true,
                deletedAt: true,
            },
        });

        if (!business || business.deletedAt) {
            throw new NotFoundException('Negocio no encontrado');
        }

        if (!business.organizationId) {
            throw new BadRequestException('Este negocio aun no tiene una organizacion activa para documentos');
        }

        if (userRole !== 'ADMIN') {
            if (!organizationRole) {
                throw new ForbiddenException('No tienes permisos para subir documentos');
            }

            if (business.organizationId !== organizationId) {
                throw new NotFoundException('Negocio no encontrado');
            }
        }

        this.assertFileSafetyForDocument(file);

        const storedAsset = await this.storeVerificationDocumentAsset(
            file.buffer,
            file.mimetype,
            business.organizationId,
            businessId,
            extension,
        );

        return {
            fileUrl: storedAsset.url,
            mimeType: file.mimetype,
            sizeBytes: file.size,
        };
    }

    async deleteUserAvatar(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                avatarUrl: true,
            },
        });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        if (!user.avatarUrl) {
            return {
                avatarUrl: null,
            };
        }

        const previousAvatarUrl = user.avatarUrl;
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: {
                avatarUrl: null,
            },
            select: {
                avatarUrl: true,
            },
        });

        await this.deleteManagedAssetByUrl(previousAvatarUrl);
        return updatedUser;
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

        await this.deleteManagedAssetByUrl(image.url);

        return { message: 'Imagen eliminada exitosamente' };
    }

    async updateBusinessImageMetadata(
        imageId: string,
        dto: UpdateBusinessImageDto,
        _userId: string,
        userRole: string,
        organizationId: string,
        organizationRole: OrganizationRole,
    ) {
        const image = await this.prisma.businessImage.findUnique({
            where: { id: imageId },
            include: {
                business: {
                    select: { id: true, organizationId: true },
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
                throw new ForbiddenException('No tienes permisos para editar esta imagen');
            }
        }

        const normalizedCaption = dto.caption === undefined
            ? undefined
            : dto.caption.trim().length > 0
                ? dto.caption.trim()
                : null;
        const nextType = dto.type ?? undefined;
        const shouldPromoteCover = dto.isCover === true || nextType === 'COVER';

        return this.prisma.$transaction(async (tx) => {
            if (shouldPromoteCover) {
                await tx.businessImage.updateMany({
                    where: {
                        businessId: image.business.id,
                        id: {
                            not: imageId,
                        },
                    },
                    data: {
                        isCover: false,
                        type: 'GALLERY',
                    },
                });
            }

            return tx.businessImage.update({
                where: { id: imageId },
                data: {
                    caption: normalizedCaption,
                    sortOrder: dto.sortOrder,
                    isCover: shouldPromoteCover
                        ? true
                        : dto.isCover === false
                            ? false
                            : undefined,
                    type: nextType,
                },
            });
        });
    }

    private async storeBusinessImageAsset(
        sourceBuffer: Buffer,
        mimeType: string,
        businessId: string,
        extension: string,
    ): Promise<StoredAsset> {
        const provider = this.resolveStorageProvider();
        if (provider === 's3') {
            return this.uploadToS3(sourceBuffer, mimeType, `businesses/${businessId}/${randomUUID()}.${extension}`);
        }

        return this.storeLocalFile(sourceBuffer, `businesses`, `${businessId}-${randomUUID()}.${extension}`);
    }

    private async storeVerificationDocumentAsset(
        sourceBuffer: Buffer,
        mimeType: string,
        organizationId: string,
        businessId: string,
        extension: string,
    ): Promise<StoredAsset> {
        const provider = this.resolveStorageProvider();
        const objectKey = `verification/${organizationId}/${businessId}/${randomUUID()}.${extension}`;

        if (provider === 's3') {
            return this.uploadToS3(sourceBuffer, mimeType, objectKey);
        }

        return this.storeLocalFile(
            sourceBuffer,
            `verification/${organizationId}/${businessId}`,
            `${randomUUID()}.${extension}`,
        );
    }

    private async storeUserAvatarAsset(
        sourceBuffer: Buffer,
        mimeType: string,
        userId: string,
        extension: string,
    ): Promise<StoredAsset> {
        const provider = this.resolveStorageProvider();
        const objectKey = `avatars/${userId}/${randomUUID()}.${extension}`;

        if (provider === 's3') {
            return this.uploadToS3(sourceBuffer, mimeType, objectKey);
        }

        return this.storeLocalFile(
            sourceBuffer,
            `avatars/${userId}`,
            `${randomUUID()}.${extension}`,
        );
    }

    private async storeLocalFile(
        sourceBuffer: Buffer,
        relativeDirectory: string,
        fileName: string,
    ): Promise<StoredAsset> {
        const uploadsDir = path.join(process.cwd(), 'uploads', ...relativeDirectory.split('/'));
        await fs.mkdir(uploadsDir, { recursive: true });

        const filePath = path.join(uploadsDir, fileName);
        await fs.writeFile(filePath, sourceBuffer);
        if (
            relativeDirectory.startsWith('businesses')
            || relativeDirectory.startsWith('avatars')
        ) {
            void this.generateOptimizedVariants(sourceBuffer, filePath);
        }

        return {
            url: `/uploads/${relativeDirectory}/${fileName}`,
            localPath: filePath,
        };
    }

    private async uploadToS3(
        sourceBuffer: Buffer,
        mimeType: string,
        objectKey: string,
    ): Promise<StoredAsset> {
        const s3Client = this.resolveS3Client();
        const bucket = this.resolveS3Bucket();

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

        const objectKey = asset.objectKey || this.resolveManagedObjectKeyFromUrl(asset.url);
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

    private async deleteManagedAssetByUrl(assetUrl: string | null | undefined): Promise<void> {
        if (!assetUrl) {
            return;
        }

        const managedAsset = this.resolveManagedStoredAsset(assetUrl);
        if (!managedAsset) {
            return;
        }

        await this.deleteStoredAsset(managedAsset).catch((error) => {
            this.logger.warn(
                `No se pudo eliminar el archivo gestionado (${error instanceof Error ? error.message : String(error)})`,
            );
        });
    }

    private resolveStorageProvider(): StorageProvider {
        const rawProvider = (this.configService.get<string>('STORAGE_PROVIDER') || 'local').trim().toLowerCase();
        return rawProvider === 's3' ? 's3' : 'local';
    }

    private resolveS3Client(): S3Client {
        if (this.s3Client) {
            return this.s3Client;
        }

        const region = (this.configService.get<string>('STORAGE_S3_REGION') || 'us-east-1').trim();
        const endpoint = this.configService.get<string>('STORAGE_S3_ENDPOINT')?.trim();
        const accessKeyId = this.configService.get<string>('STORAGE_S3_ACCESS_KEY_ID')?.trim();
        const secretAccessKey = this.configService.get<string>('STORAGE_S3_SECRET_ACCESS_KEY')?.trim();
        const forcePathStyle = ['1', 'true'].includes(
            (this.configService.get<string>('STORAGE_S3_FORCE_PATH_STYLE') || 'false').trim().toLowerCase(),
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
        const bucket = this.configService.get<string>('STORAGE_S3_BUCKET')?.trim();
        if (!bucket) {
            throw new BadRequestException('STORAGE_S3_BUCKET no está configurado');
        }
        return bucket;
    }

    private resolvePublicObjectUrl(bucket: string, objectKey: string): string {
        const explicitPublicBaseUrl = this.configService.get<string>('STORAGE_PUBLIC_BASE_URL')?.trim();
        if (explicitPublicBaseUrl) {
            return `${explicitPublicBaseUrl.replace(/\/+$/, '')}/${objectKey}`;
        }

        const endpoint = this.configService.get<string>('STORAGE_S3_ENDPOINT')?.trim();
        if (endpoint) {
            const baseEndpoint = endpoint.replace(/\/+$/, '');
            const forcePathStyle = ['1', 'true'].includes(
                (this.configService.get<string>('STORAGE_S3_FORCE_PATH_STYLE') || 'false').trim().toLowerCase(),
            );
            if (forcePathStyle) {
                return `${baseEndpoint}/${bucket}/${objectKey}`;
            }
            return `${baseEndpoint}/${objectKey}`;
        }

        const region = (this.configService.get<string>('STORAGE_S3_REGION') || 'us-east-1').trim();
        return `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}`;
    }

    private assertFileSafetyForDocument(file: Express.Multer.File): void {
        if (!file.buffer || file.buffer.length === 0) {
            throw new BadRequestException('Documento vacío');
        }

        const mode = (this.configService.get<string>('UPLOAD_AV_SCAN_MODE') || 'off').trim().toLowerCase();
        if (mode === 'off') {
            return;
        }

        // Basic executable signatures to avoid accidental binary uploads.
        const signatureHex = file.buffer.subarray(0, 4).toString('hex').toLowerCase();
        const blockedSignatures = new Set(['4d5a', '7f454c46', 'cafebabe', 'feedface', 'feedfacf']);
        for (const blocked of blockedSignatures) {
            if (signatureHex.startsWith(blocked)) {
                throw new BadRequestException('Archivo rechazado por validación de seguridad');
            }
        }
    }

    private resolveManagedStoredAsset(assetUrl: string): StoredAsset | null {
        const localPath = this.resolveUploadPath(assetUrl);
        if (localPath) {
            return {
                url: assetUrl,
                localPath,
            };
        }

        const objectKey = this.resolveManagedObjectKeyFromUrl(assetUrl);
        if (objectKey) {
            return {
                url: assetUrl,
                objectKey,
            };
        }

        return null;
    }

    private resolveManagedObjectKeyFromUrl(assetUrl: string): string | null {
        const normalized = assetUrl.trim();
        const publicBase = this.configService.get<string>('STORAGE_PUBLIC_BASE_URL')?.trim().replace(/\/+$/, '');

        if (publicBase && normalized.startsWith(`${publicBase}/`)) {
            return decodeURIComponent(normalized.slice(publicBase.length + 1));
        }

        if (this.resolveStorageProvider() !== 's3') {
            return null;
        }

        try {
            const parsed = new URL(normalized);
            const bucket = this.resolveS3Bucket();
            const pathname = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
            const endpoint = this.configService.get<string>('STORAGE_S3_ENDPOINT')?.trim().replace(/\/+$/, '');

            if (endpoint) {
                const parsedEndpoint = new URL(endpoint);
                if (parsed.origin !== parsedEndpoint.origin) {
                    return null;
                }

                const forcePathStyle = ['1', 'true'].includes(
                    (this.configService.get<string>('STORAGE_S3_FORCE_PATH_STYLE') || 'false').trim().toLowerCase(),
                );

                if (forcePathStyle) {
                    if (!pathname.startsWith(`${bucket}/`)) {
                        return null;
                    }

                    return pathname.slice(bucket.length + 1);
                }

                return pathname || null;
            }

            const region = (this.configService.get<string>('STORAGE_S3_REGION') || 'us-east-1').trim();
            const expectedHost = `${bucket}.s3.${region}.amazonaws.com`;
            if (parsed.hostname !== expectedHost) {
                return null;
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
