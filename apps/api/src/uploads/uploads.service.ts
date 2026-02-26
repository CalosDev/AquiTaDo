import { Injectable, Inject, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationRole } from '../generated/prisma/client';

@Injectable()
export class UploadsService {
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

        const uploadsDir = path.join(process.cwd(), 'uploads', 'businesses');
        await fs.mkdir(uploadsDir, { recursive: true });

        const fileName = `${businessId}-${randomUUID()}.${extension}`;
        const filePath = path.join(uploadsDir, fileName);
        await fs.writeFile(filePath, file.buffer);

        try {
            return await this.prisma.businessImage.create({
                data: {
                    url: `/uploads/businesses/${fileName}`,
                    businessId,
                },
            });
        } catch (error) {
            await fs.unlink(filePath).catch(() => undefined);
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

        const filePath = this.resolveUploadPath(image.url);
        if (filePath) {
            try {
                await fs.unlink(filePath);
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (code !== 'ENOENT') {
                    throw error;
                }
            }
        }

        return { message: 'Imagen eliminada exitosamente' };
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
}
