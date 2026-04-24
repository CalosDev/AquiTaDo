import {
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { OrganizationRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationAccessService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    async resolveActorRole(
        organizationId: string,
        userId: string,
    ): Promise<OrganizationRole> {
        const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: { id: true },
        });

        if (!organization) {
            throw new NotFoundException('Organizacion no encontrada');
        }

        const membership = await this.prisma.organizationMember.findUnique({
            where: {
                organizationId_userId: {
                    organizationId,
                    userId,
                },
            },
            select: { role: true },
        });

        if (!membership) {
            throw new ForbiddenException('No tienes acceso a esta organizacion');
        }

        return membership.role;
    }

    assertOrganizationMember(
        actorRole: OrganizationRole | null,
        message = 'No tienes acceso a esta organizacion',
    ): asserts actorRole is OrganizationRole {
        if (!actorRole) {
            throw new ForbiddenException(message);
        }
    }

    assertCanManageOrganization(
        actorRole: OrganizationRole,
        message = 'No tienes permisos para gestionar esta organizacion',
    ): void {
        if (actorRole !== 'OWNER' && actorRole !== 'MANAGER') {
            throw new ForbiddenException(message);
        }
    }

    assertInvitePermission(actorRole: OrganizationRole, inviteRole: OrganizationRole): void {
        if (actorRole === 'OWNER') {
            if (inviteRole === 'OWNER') {
                throw new ForbiddenException('No puedes invitar otro OWNER desde este endpoint');
            }
            return;
        }

        if (actorRole === 'MANAGER') {
            if (inviteRole !== 'STAFF') {
                throw new ForbiddenException('El rol MANAGER solo puede invitar miembros STAFF');
            }
            return;
        }

        throw new ForbiddenException('No tienes permisos para invitar miembros');
    }

    assertOwner(
        actorRole: OrganizationRole,
        message = 'Solo el owner puede ejecutar esta accion',
    ): void {
        if (actorRole !== 'OWNER') {
            throw new ForbiddenException(message);
        }
    }
}
