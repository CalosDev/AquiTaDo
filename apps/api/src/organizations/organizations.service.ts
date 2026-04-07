import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import slugify from 'slugify';
import {
    OrganizationRole,
    Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    CreateOrganizationDto,
    InviteOrganizationMemberDto,
    UpdateOrganizationDto,
    UpdateOrganizationMemberRoleDto,
    UpdateOrganizationSubscriptionDto,
} from './dto/organization.dto';
import { OrganizationsUsageService } from './organizations-usage.service';

type ActorOrgRole = OrganizationRole;
type PrismaClientLike = PrismaService | Prisma.TransactionClient;
type AuditLogClient = PrismaClientLike;

const ROLE_PRIORITY: Record<OrganizationRole, number> = {
    OWNER: 3,
    MANAGER: 2,
    STAFF: 1,
};

function maxRole(left: OrganizationRole, right: OrganizationRole): OrganizationRole {
    return ROLE_PRIORITY[left] >= ROLE_PRIORITY[right] ? left : right;
}

@Injectable()
export class OrganizationsService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(OrganizationsUsageService)
        private readonly organizationsUsageService: OrganizationsUsageService,
    ) { }

    private readonly logger = new Logger(OrganizationsService.name);

    async create(dto: CreateOrganizationDto, userId: string) {
        const baseSlug = slugify(dto.name, { lower: true, strict: true });
        if (!baseSlug) {
            throw new BadRequestException('El nombre de la organizacion no es valido para generar un slug');
        }

        const slug = await this.generateUniqueSlug(baseSlug);

        return this.prisma.$transaction(async (tx) => {
            const organization = await tx.organization.create({
                data: {
                    name: dto.name.trim(),
                    slug,
                    ownerUserId: userId,
                },
            });

            await tx.organizationMember.upsert({
                where: {
                    organizationId_userId: {
                        organizationId: organization.id,
                        userId,
                    },
                },
                update: { role: 'OWNER' },
                create: {
                    organizationId: organization.id,
                    userId,
                    role: 'OWNER',
                },
            });

            await tx.user.updateMany({
                where: { id: userId, role: 'USER' },
                data: { role: 'BUSINESS_OWNER' },
            });

            const freePlan = await tx.plan.findUnique({
                where: { code: 'FREE' },
                select: { id: true },
            });
            if (!freePlan) {
                throw new BadRequestException(
                    'No existe el plan FREE en la base de datos. Ejecuta el seed de planes.',
                );
            }

            await tx.subscription.create({
                data: {
                    organizationId: organization.id,
                    planId: freePlan.id,
                    status: 'ACTIVE',
                    currentPeriodStart: new Date(),
                },
            });

            await this.writeAuditLog(tx, {
                organizationId: organization.id,
                actorUserId: userId,
                action: 'organization.created',
                targetType: 'organization',
                targetId: organization.id,
                metadata: {
                    name: organization.name,
                    slug: organization.slug,
                },
            });

            this.logger.log(
                `organization.created org=${organization.id} actor=${userId} slug=${organization.slug}`,
            );

            return tx.organization.findUnique({
                where: { id: organization.id },
                include: this.organizationInclude,
            });
        });
    }

    async findMine(userId: string) {
        const memberships = await this.prisma.organizationMember.findMany({
            where: { userId },
            include: {
                organization: {
                    include: this.organizationInclude,
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        return memberships.map((membership) => ({
            ...membership.organization,
            membership: {
                role: membership.role,
                joinedAt: membership.createdAt,
            },
        }));
    }

    async findById(organizationId: string, userId: string) {
        const actorRole = await this.resolveActorRole(organizationId, userId);

        const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            include: this.organizationInclude,
        });

        if (!organization) {
            throw new NotFoundException('Organizacion no encontrada');
        }

        return {
            ...organization,
            actorRole,
        };
    }

    async update(organizationId: string, dto: UpdateOrganizationDto, userId: string) {
        const actorRole = await this.resolveActorRole(organizationId, userId);
        this.assertCanManageOrganization(actorRole);

        const existing = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: { id: true, name: true, slug: true },
        });

        if (!existing) {
            throw new NotFoundException('Organizacion no encontrada');
        }

        const normalizedName = dto.name?.trim();
        if (!normalizedName) {
            return this.prisma.organization.findUnique({
                where: { id: organizationId },
                include: this.organizationInclude,
            });
        }

        const slugBase = slugify(normalizedName, { lower: true, strict: true });
        if (!slugBase) {
            throw new BadRequestException('El nombre de la organizacion no es valido para generar un slug');
        }

        const slug =
            normalizedName === existing.name
                ? existing.slug
                : await this.generateUniqueSlug(slugBase, organizationId);

        const updatedOrganization = await this.prisma.organization.update({
            where: { id: organizationId },
            data: {
                name: normalizedName,
                slug,
            },
            include: this.organizationInclude,
        });

        await this.writeAuditLog(this.prisma, {
            organizationId,
            actorUserId: userId,
            action: 'organization.updated',
            targetType: 'organization',
            targetId: organizationId,
            metadata: {
                name: normalizedName,
                slug,
            },
        });

        this.logger.log(`organization.updated org=${organizationId} actor=${userId}`);

        return updatedOrganization;
    }

    async listMembers(organizationId: string, userId: string) {
        await this.resolveActorRole(organizationId, userId);

        return this.prisma.organizationMember.findMany({
            where: { organizationId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    async listInvites(organizationId: string, userId: string) {
        const actorRole = await this.resolveActorRole(organizationId, userId);
        this.assertCanManageOrganization(actorRole);

        return this.prisma.organizationInvite.findMany({
            where: {
                organizationId,
                acceptedAt: null,
            },
            include: {
                invitedByUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getSubscription(organizationId: string, userId: string) {
        const actorRole = await this.resolveActorRole(organizationId, userId);

        const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                name: true,
                slug: true,
                plan: true,
                subscriptionStatus: true,
                subscriptionRenewsAt: true,
            },
        });

        if (!organization) {
            throw new NotFoundException('Organizacion no encontrada');
        }

        const usageSnapshot = await this.organizationsUsageService.getUsageSnapshot(
            this.prisma,
            organizationId,
            organization.plan,
        );

        return {
            ...organization,
            actorRole,
            limits: usageSnapshot.limits,
            usage: usageSnapshot.usage,
            remaining: usageSnapshot.remaining,
        };
    }

    async updateSubscription(
        organizationId: string,
        dto: UpdateOrganizationSubscriptionDto,
        userId: string,
    ) {
        const actorRole = await this.resolveActorRole(organizationId, userId);
        if (actorRole !== 'OWNER') {
            throw new ForbiddenException('Solo el owner puede actualizar la suscripcion de la organizacion');
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const currentOrganization = await tx.organization.findUnique({
                where: { id: organizationId },
                select: {
                    id: true,
                    plan: true,
                    subscriptionStatus: true,
                    subscriptionRenewsAt: true,
                },
            });

            if (!currentOrganization) {
                throw new NotFoundException('Organizacion no encontrada');
            }

            const usageSnapshot = await this.organizationsUsageService.getUsageSnapshot(
                tx,
                organizationId,
                dto.plan,
            );
            this.organizationsUsageService.assertPlanSupportsCurrentUsage(
                dto.plan,
                usageSnapshot.usage.businesses,
                usageSnapshot.usage.allocatedSeats,
            );

            const updateData: Prisma.OrganizationUpdateInput = {
                plan: dto.plan,
                subscriptionStatus: dto.subscriptionStatus ?? currentOrganization.subscriptionStatus,
            };

            if (dto.subscriptionRenewsAt !== undefined) {
                updateData.subscriptionRenewsAt = new Date(dto.subscriptionRenewsAt);
            }

            const organization = await tx.organization.update({
                where: { id: organizationId },
                data: updateData,
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    plan: true,
                    subscriptionStatus: true,
                    subscriptionRenewsAt: true,
                },
            });

            const linkedPlan = await tx.plan.findUnique({
                where: { code: dto.plan },
                select: { id: true },
            });

            if (linkedPlan) {
                await tx.subscription.upsert({
                    where: { organizationId },
                    update: {
                        planId: linkedPlan.id,
                        status:
                            dto.subscriptionStatus === 'PAST_DUE'
                                ? 'PAST_DUE'
                                : dto.subscriptionStatus === 'CANCELED'
                                    ? 'CANCELED'
                                    : 'ACTIVE',
                        currentPeriodEnd: organization.subscriptionRenewsAt ?? null,
                    },
                    create: {
                        organizationId,
                        planId: linkedPlan.id,
                        status:
                            dto.subscriptionStatus === 'PAST_DUE'
                                ? 'PAST_DUE'
                                : dto.subscriptionStatus === 'CANCELED'
                                    ? 'CANCELED'
                                    : 'ACTIVE',
                        currentPeriodStart: new Date(),
                        currentPeriodEnd: organization.subscriptionRenewsAt ?? null,
                    },
                });
            }

            await this.writeAuditLog(tx, {
                organizationId,
                actorUserId: userId,
                action: 'organization.subscription.updated',
                targetType: 'organization',
                targetId: organizationId,
                metadata: {
                    previousPlan: currentOrganization.plan,
                    newPlan: dto.plan,
                    previousStatus: currentOrganization.subscriptionStatus,
                    newStatus: dto.subscriptionStatus ?? currentOrganization.subscriptionStatus,
                },
            });

            return organization;
        });

        this.logger.log(
            `organization.subscription.updated org=${organizationId} actor=${userId} plan=${updated.plan}`,
        );

        const usageSnapshot = await this.organizationsUsageService.getUsageSnapshot(
            this.prisma,
            organizationId,
            updated.plan,
        );

        return {
            ...updated,
            limits: usageSnapshot.limits,
            usage: usageSnapshot.usage,
            remaining: usageSnapshot.remaining,
        };
    }

    async getUsage(organizationId: string, userId: string) {
        await this.resolveActorRole(organizationId, userId);

        const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                name: true,
                plan: true,
            },
        });

        if (!organization) {
            throw new NotFoundException('Organizacion no encontrada');
        }

        const usageSnapshot = await this.organizationsUsageService.getUsageSnapshot(
            this.prisma,
            organizationId,
            organization.plan,
        );

        return {
            organizationId: organization.id,
            organizationName: organization.name,
            plan: organization.plan,
            limits: usageSnapshot.limits,
            usage: usageSnapshot.usage,
            remaining: usageSnapshot.remaining,
        };
    }

    async listAuditLogs(organizationId: string, userId: string, limit = 50) {
        await this.resolveActorRole(organizationId, userId);

        const boundedLimit = Math.min(Math.max(limit, 1), 200);

        return this.prisma.auditLog.findMany({
            where: { organizationId },
            include: {
                actorUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: boundedLimit,
        });
    }

    async inviteMember(
        organizationId: string,
        dto: InviteOrganizationMemberDto,
        userId: string,
    ) {
        const actorRole = await this.resolveActorRole(organizationId, userId);
        this.assertCanManageOrganization(actorRole);

        const inviteRole = dto.role ?? 'STAFF';
        this.assertInvitePermission(actorRole, inviteRole);

        const normalizedEmail = dto.email.trim().toLowerCase();

        const existingMember = await this.prisma.organizationMember.findFirst({
            where: {
                organizationId,
                user: {
                    email: normalizedEmail,
                },
            },
            select: {
                userId: true,
            },
        });

        if (existingMember) {
            throw new ConflictException('Ese correo ya pertenece a la organizacion');
        }

        const plainToken = randomBytes(32).toString('hex');
        const tokenHash = this.hashInviteToken(plainToken);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

        const invite = await this.prisma.$transaction(async (tx) => {
            await tx.organizationInvite.deleteMany({
                where: {
                    organizationId,
                    email: normalizedEmail,
                    acceptedAt: null,
                },
            });

            await this.organizationsUsageService.assertCanAllocateSeat(tx, organizationId, true);

            const createdInvite = await tx.organizationInvite.create({
                data: {
                    organizationId,
                    email: normalizedEmail,
                    role: inviteRole,
                    tokenHash,
                    expiresAt,
                    invitedByUserId: userId,
                },
                select: {
                    id: true,
                    organizationId: true,
                    email: true,
                    role: true,
                    expiresAt: true,
                    createdAt: true,
                },
            });

            await this.writeAuditLog(tx, {
                organizationId,
                actorUserId: userId,
                action: 'organization.invite.created',
                targetType: 'organization_invite',
                targetId: createdInvite.id,
                metadata: {
                    email: normalizedEmail,
                    role: inviteRole,
                },
            });

            return createdInvite;
        });

        this.logger.log(
            `organization.invite.created org=${organizationId} actor=${userId} email=${normalizedEmail} role=${inviteRole}`,
        );

        return {
            ...invite,
            token: plainToken,
        };
    }

    async acceptInvite(token: string, userId: string) {
        const normalizedToken = token.trim();
        if (!normalizedToken) {
            throw new BadRequestException('Token de invitacion invalido');
        }

        const tokenHash = this.hashInviteToken(normalizedToken);
        const invite = await this.prisma.organizationInvite.findUnique({
            where: { tokenHash },
            include: {
                organization: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        subscriptionStatus: true,
                    },
                },
            },
        });

        if (!invite) {
            throw new NotFoundException('Invitacion no encontrada');
        }

        if (invite.acceptedAt) {
            throw new BadRequestException('La invitacion ya fue aceptada');
        }

        if (invite.expiresAt.getTime() <= Date.now()) {
            throw new BadRequestException('La invitacion ha expirado');
        }

        if (invite.organization.subscriptionStatus === 'CANCELED') {
            throw new ForbiddenException('La suscripcion de esta organizacion esta cancelada');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, role: true },
        });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        if (user.email.trim().toLowerCase() !== invite.email.trim().toLowerCase()) {
            throw new ForbiddenException('Esta invitacion no pertenece a tu cuenta');
        }

        const membership = await this.prisma.$transaction(async (tx) => {
            const currentMembership = await tx.organizationMember.findUnique({
                where: {
                    organizationId_userId: {
                        organizationId: invite.organizationId,
                        userId: user.id,
                    },
                },
                select: { role: true },
            });

            const roleToApply = currentMembership
                ? maxRole(currentMembership.role, invite.role)
                : invite.role;

            const upsertedMembership = await tx.organizationMember.upsert({
                where: {
                    organizationId_userId: {
                        organizationId: invite.organizationId,
                        userId: user.id,
                    },
                },
                update: {
                    role: roleToApply,
                },
                create: {
                    organizationId: invite.organizationId,
                    userId: user.id,
                    role: roleToApply,
                },
                select: {
                    organizationId: true,
                    role: true,
                },
            });

            await tx.organizationInvite.update({
                where: { id: invite.id },
                data: { acceptedAt: new Date() },
            });

            await tx.user.updateMany({
                where: { id: user.id, role: 'USER' },
                data: { role: 'BUSINESS_OWNER' },
            });

            await this.writeAuditLog(tx, {
                organizationId: invite.organizationId,
                actorUserId: user.id,
                action: 'organization.invite.accepted',
                targetType: 'organization_invite',
                targetId: invite.id,
                metadata: {
                    membershipRole: upsertedMembership.role,
                },
            });

            return upsertedMembership;
        });

        this.logger.log(
            `organization.invite.accepted org=${invite.organizationId} user=${user.id} role=${membership.role}`,
        );

        return {
            organization: invite.organization,
            membership,
            message: 'Invitacion aceptada exitosamente',
        };
    }

    async updateMemberRole(
        organizationId: string,
        memberUserId: string,
        dto: UpdateOrganizationMemberRoleDto,
        actorUserId: string,
    ) {
        const actorRole = await this.resolveActorRole(organizationId, actorUserId);
        this.assertCanManageOrganization(actorRole);

        const targetMembership = await this.prisma.organizationMember.findUnique({
            where: {
                organizationId_userId: {
                    organizationId,
                    userId: memberUserId,
                },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        if (!targetMembership) {
            throw new NotFoundException('Miembro no encontrado');
        }

        if (targetMembership.role === 'OWNER') {
            throw new ForbiddenException('No puedes modificar el rol del owner de la organizacion');
        }

        if (actorRole === 'MANAGER') {
            if (targetMembership.role !== 'STAFF' || dto.role !== 'STAFF') {
                throw new ForbiddenException('El rol MANAGER solo puede gestionar miembros STAFF');
            }
        }

        if (dto.role === 'OWNER') {
            throw new ForbiddenException('No se puede asignar rol OWNER desde este endpoint');
        }

        const updatedMembership = await this.prisma.organizationMember.update({
            where: {
                organizationId_userId: {
                    organizationId,
                    userId: memberUserId,
                },
            },
            data: { role: dto.role },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        await this.writeAuditLog(this.prisma, {
            organizationId,
            actorUserId: actorUserId,
            action: 'organization.member.role_updated',
            targetType: 'organization_member',
            targetId: memberUserId,
            metadata: {
                role: dto.role,
            },
        });

        this.logger.log(
            `organization.member.role_updated org=${organizationId} actor=${actorUserId} target=${memberUserId} role=${dto.role}`,
        );

        return updatedMembership;
    }

    async removeMember(
        organizationId: string,
        memberUserId: string,
        actorUserId: string,
    ) {
        const actorRole = await this.resolveActorRole(organizationId, actorUserId);
        this.assertCanManageOrganization(actorRole);

        const targetMembership = await this.prisma.organizationMember.findUnique({
            where: {
                organizationId_userId: {
                    organizationId,
                    userId: memberUserId,
                },
            },
            select: {
                role: true,
                userId: true,
            },
        });

        if (!targetMembership) {
            throw new NotFoundException('Miembro no encontrado');
        }

        if (targetMembership.role === 'OWNER') {
            throw new ForbiddenException('No puedes eliminar al owner de la organizacion');
        }

        if (actorRole === 'MANAGER' && targetMembership.role !== 'STAFF') {
            throw new ForbiddenException('El rol MANAGER solo puede remover miembros STAFF');
        }

        await this.prisma.organizationMember.delete({
            where: {
                organizationId_userId: {
                    organizationId,
                    userId: memberUserId,
                },
            },
        });

        await this.writeAuditLog(this.prisma, {
            organizationId,
            actorUserId: actorUserId,
            action: 'organization.member.removed',
            targetType: 'organization_member',
            targetId: memberUserId,
            metadata: {
                previousRole: targetMembership.role,
            },
        });

        this.logger.log(
            `organization.member.removed org=${organizationId} actor=${actorUserId} target=${memberUserId}`,
        );

        return { message: 'Miembro removido exitosamente' };
    }

    private readonly organizationInclude = {
        ownerUser: {
            select: {
                id: true,
                name: true,
                email: true,
            },
        },
        _count: {
            select: {
                businesses: true,
                members: true,
                invites: true,
            },
        },
    } as const;

    private async resolveActorRole(
        organizationId: string,
        userId: string,
    ): Promise<ActorOrgRole> {
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

    private assertCanManageOrganization(actorRole: ActorOrgRole): void {
        if (actorRole !== 'OWNER' && actorRole !== 'MANAGER') {
            throw new ForbiddenException('No tienes permisos para gestionar esta organizacion');
        }
    }

    private assertInvitePermission(actorRole: ActorOrgRole, inviteRole: OrganizationRole): void {
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

    private async generateUniqueSlug(baseSlug: string, excludeOrganizationId?: string): Promise<string> {
        let slug = baseSlug;
        let counter = 1;

        while (true) {
            const existing = await this.prisma.organization.findUnique({
                where: { slug },
                select: { id: true },
            });

            if (!existing || existing.id === excludeOrganizationId) {
                return slug;
            }

            slug = `${baseSlug}-${counter}`;
            counter += 1;
        }
    }

    private hashInviteToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    private async writeAuditLog(
        client: AuditLogClient,
        payload: {
            organizationId?: string | null;
            actorUserId?: string | null;
            action: string;
            targetType: string;
            targetId?: string | null;
            metadata?: Prisma.InputJsonValue;
        },
    ): Promise<void> {
        await client.auditLog.create({
            data: {
                organizationId: payload.organizationId ?? null,
                actorUserId: payload.actorUserId ?? null,
                action: payload.action,
                targetType: payload.targetType,
                targetId: payload.targetId ?? null,
                metadata: payload.metadata,
            },
        });
    }
}

