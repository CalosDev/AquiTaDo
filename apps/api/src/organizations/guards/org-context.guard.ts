import {
    BadRequestException,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
    Inject,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequestWithOrganizationContext } from '../types/organization-context.type';

@Injectable()
export class OrgContextGuard implements CanActivate {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    protected isOrganizationRequired(): boolean {
        return true;
    }

    private readonly uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<RequestWithOrganizationContext>();
        const user = request.user;

        if (!user?.id) {
            throw new UnauthorizedException('Unauthorized');
        }

        const organizationId = this.resolveOrganizationId(request);
        if (!organizationId) {
            request.organizationContext = null;
            if (this.isOrganizationRequired()) {
                throw new BadRequestException(
                    'Debes seleccionar una organización activa (header x-organization-id)',
                );
            }
            return true;
        }

        if (!this.uuidPattern.test(organizationId)) {
            throw new BadRequestException('El organizationId debe ser un UUID valido');
        }

        const organizationExists = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: { id: true },
        });

        if (!organizationExists) {
            throw new NotFoundException('Organización no encontrada');
        }

        if (user.role === 'ADMIN') {
            request.organizationContext = {
                organizationId,
                organizationRole: 'OWNER',
                isGlobalAdmin: true,
            };
            return true;
        }

        const membership = await this.prisma.organizationMember.findUnique({
            where: {
                organizationId_userId: {
                    organizationId,
                    userId: user.id,
                },
            },
            select: { role: true },
        });

        if (!membership) {
            throw new ForbiddenException('No tienes acceso a esta organización');
        }

        request.organizationContext = {
            organizationId,
            organizationRole: membership.role as OrganizationRole,
            isGlobalAdmin: false,
        };
        return true;
    }

    private resolveOrganizationId(request: RequestWithOrganizationContext): string | null {
        const headerValue = request.headers['x-organization-id'];
        const rawHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
        const normalizedHeader = typeof rawHeader === 'string' ? rawHeader.trim() : '';
        if (normalizedHeader) {
            return normalizedHeader;
        }

        const queryValue = request.query?.organizationId;
        const rawQuery = Array.isArray(queryValue) ? queryValue[0] : queryValue;
        const normalizedQuery = typeof rawQuery === 'string' ? rawQuery.trim() : '';
        if (normalizedQuery) {
            return normalizedQuery;
        }

        return null;
    }
}
