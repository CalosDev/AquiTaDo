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
    OrganizationPlan,
    OrganizationRole,
    OrganizationSubscriptionStatus,
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
import { getOrganizationPlanLimits } from './organization-plan-limits';

type ActorOrgRole = OrganizationRole | 'ADMIN';
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
    ) { }
    private readonly logger = new Logger(OrganizationsService.name);

    async create(dto: CreateOrganizationDto, userId: string) {
        const baseSlug = slugify(dto.name, { lower: true, strict: true });
        if (!baseSlug) {
            throw new BadRequestException('El nombre de la organización no es válido para generar un slug');
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

    async findById(organizationId: string, userId: string, userRole: string) {
        const actorRole = await this.resolveActorRole(organizationId, userId, userRole);

        const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            include: this.organizationInclude,
        });

        if (!organization) {
            throw new NotFoundException('Organización no encontrada');
        }

        return {
            ...organization,
            actorRole: actorRole === 'ADMIN' ? 'OWNER' : actorRole,
            isGlobalAdmin: actorRole === 'ADMIN',
        };
    }

    async update(organizationId: string, dto: UpdateOrganizationDto, userId: string, userRole: string) {
        const actorRole = await this.resolveActorRole(organizationId, userId, userRole);
        this.assertCanManageOrganization(actorRole);

        const existing = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: { id: true, name: true, slug: true },
        });

        if (!existing) {
            throw new NotFoundException('Organización no encontrada');
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
            throw new BadRequestException('El nombre de la organización no es válido para generar un slug');
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

    async listMembers(organizationId: string, userId: string, userRole: string) {
        await this.resolveActorRole(organizationId, userId, userRole);

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

    async listInvites(organizationId: string, userId: string, userRole: string) {
        const actorRole = await this.resolveActorRole(organizationId, userId, userRole);
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

    async getSubscription(organizationId: string, userId: string, userRole: string) {
        const actorRole = await this.resolveActorRole(organizationId, userId, userRole);

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
            throw new NotFoundException('Organización no encontrada');
        }

        const usageSnapshot = await this.getUsageSnapshot(this.prisma, organizationId, organization.plan);

        return {
            ...organization,
            actorRole: actorRole === 'ADMIN' ? 'OWNER' : actorRole,
            isGlobalAdmin: actorRole === 'ADMIN',
            limits: usageSnapshot.limits,
            usage: usageSnapshot.usage,
            remaining: usageSnapshot.remaining,
        };
    }

    async updateSubscription(
        organizationId: string,
        dto: UpdateOrganizationSubscriptionDto,
        userId: string,
        userRole: string,
    ) {
        const actorRole = await this.resolveActorRole(organizationId, userId, userRole);
        if (actorRole !== 'ADMIN' && actorRole !== 'OWNER') {
            throw new ForbiddenException('Solo el owner puede actualizar la suscripción de la organización');
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
                throw new NotFoundException('Organización no encontrada');
            }

            const usageSnapshot = await this.getUsageSnapshot(tx, organizationId, dto.plan);
            this.assertPlanSupportsCurrentUsage(dto.plan, usageSnapshot.usage.businesses, usageSnapshot.usage.allocatedSeats);

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

        const usageSnapshot = await this.getUsageSnapshot(this.prisma, organizationId, updated.plan);

        return {
            ...updated,
            limits: usageSnapshot.limits,
            usage: usageSnapshot.usage,
            remaining: usageSnapshot.remaining,
        };
    }

    async getUsage(organizationId: string, userId: string, userRole: string) {
        await this.resolveActorRole(organizationId, userId, userRole);

        const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                name: true,
                plan: true,
            },
        });

        if (!organization) {
            throw new NotFoundException('Organización no encontrada');
        }

        const usageSnapshot = await this.getUsageSnapshot(this.prisma, organizationId, organization.plan);

        return {
            organizationId: organization.id,
            organizationName: organization.name,
            plan: organization.plan,
            limits: usageSnapshot.limits,
            usage: usageSnapshot.usage,
            remaining: usageSnapshot.remaining,
        };
    }

    async listAuditLogs(organizationId: string, userId: string, userRole: string, limit = 50) {
        await this.resolveActorRole(organizationId, userId, userRole);

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
        userRole: string,
    ) {
        const actorRole = await this.resolveActorRole(organizationId, userId, userRole);
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
            throw new ConflictException('Ese correo ya pertenece a la organización');
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

            await this.assertCanAllocateSeat(tx, organizationId, true);

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
            throw new BadRequestException('Token de invitación inválido');
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
            throw new NotFoundException('Invitación no encontrada');
        }

        if (invite.acceptedAt) {
            throw new BadRequestException('La invitación ya fue aceptada');
        }

        if (invite.expiresAt.getTime() <= Date.now()) {
            throw new BadRequestException('La invitación ha expirado');
        }

        if (invite.organization.subscriptionStatus === 'CANCELED') {
            throw new ForbiddenException('La suscripción de esta organización está cancelada');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, role: true },
        });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        if (user.email.trim().toLowerCase() !== invite.email.trim().toLowerCase()) {
            throw new ForbiddenException('Esta invitación no pertenece a tu cuenta');
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
            message: 'Invitación aceptada exitosamente',
        };
    }

    async updateMemberRole(
        organizationId: string,
        memberUserId: string,
        dto: UpdateOrganizationMemberRoleDto,
        actorUserId: string,
        actorGlobalRole: string,
    ) {
        const actorRole = await this.resolveActorRole(organizationId, actorUserId, actorGlobalRole);
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
            throw new ForbiddenException('No puedes modificar el rol del owner de la organización');
        }

        if (actorRole === 'MANAGER') {
            if (targetMembership.role !== 'STAFF' || dto.role !== 'STAFF') {
                throw new ForbiddenException('El rol MANAGER solo puede gestionar miembros STAFF');
            }
        }

        if (dto.role === 'OWNER' && actorRole !== 'ADMIN') {
            throw new ForbiddenException('Solo un admin global puede asignar rol OWNER');
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
        actorGlobalRole: string,
    ) {
        const actorRole = await this.resolveActorRole(organizationId, actorUserId, actorGlobalRole);
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
            throw new ForbiddenException('No puedes eliminar al owner de la organización');
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

    private async getUsageSnapshot(
        client: PrismaClientLike,
        organizationId: string,
        planOverride?: OrganizationPlan,
    ): Promise<{
        plan: OrganizationPlan;
        subscriptionStatus: OrganizationSubscriptionStatus;
        limits: ReturnType<typeof getOrganizationPlanLimits>;
        usage: {
            businesses: number;
            members: number;
            pendingInvites: number;
            allocatedSeats: number;
        };
        remaining: {
            businesses: number | null;
            seats: number | null;
        };
    }> {
        const organization = await client.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                plan: true,
                subscriptionStatus: true,
            },
        });

        if (!organization) {
            throw new NotFoundException('Organización no encontrada');
        }

        const effectivePlan = planOverride ?? organization.plan;
        const limits = getOrganizationPlanLimits(effectivePlan);

        const [businesses, members, pendingInvites] = await Promise.all([
            client.business.count({
                where: { organizationId },
            }),
            client.organizationMember.count({
                where: { organizationId },
            }),
            client.organizationInvite.count({
                where: {
                    organizationId,
                    acceptedAt: null,
                    expiresAt: {
                        gt: new Date(),
                    },
                },
            }),
        ]);

        const allocatedSeats = members + pendingInvites;

        return {
            plan: effectivePlan,
            subscriptionStatus: organization.subscriptionStatus,
            limits,
            usage: {
                businesses,
                members,
                pendingInvites,
                allocatedSeats,
            },
            remaining: {
                businesses:
                    limits.maxBusinesses === null
                        ? null
                        : Math.max(limits.maxBusinesses - businesses, 0),
                seats:
                    limits.maxMembers === null
                        ? null
                        : Math.max(limits.maxMembers - allocatedSeats, 0),
            },
        };
    }

    private assertPlanSupportsCurrentUsage(
        targetPlan: OrganizationPlan,
        currentBusinesses: number,
        currentAllocatedSeats: number,
    ): void {
        const limits = getOrganizationPlanLimits(targetPlan);

        if (limits.maxBusinesses !== null && currentBusinesses > limits.maxBusinesses) {
            throw new BadRequestException(
                `No puedes cambiar al plan ${targetPlan} porque excede el limite de negocios`,
            );
        }

        if (limits.maxMembers !== null && currentAllocatedSeats > limits.maxMembers) {
            throw new BadRequestException(
                `No puedes cambiar al plan ${targetPlan} porque excede el limite de miembros`,
            );
        }
    }

    private async assertCanAllocateSeat(
        client: PrismaClientLike,
        organizationId: string,
        allocatingNewSeat: boolean,
    ): Promise<void> {
        const usageSnapshot = await this.getUsageSnapshot(client, organizationId);

        if (usageSnapshot.subscriptionStatus === 'CANCELED') {
            throw new ForbiddenException('La suscripción de la organización está cancelada');
        }

        if (!allocatingNewSeat) {
            return;
        }

        if (
            usageSnapshot.limits.maxMembers !== null &&
            usageSnapshot.usage.allocatedSeats >= usageSnapshot.limits.maxMembers
        ) {
            throw new BadRequestException('La organización alcanzó el límite de miembros de su plan');
        }
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
        userRole: string,
    ): Promise<ActorOrgRole> {
        const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: { id: true },
        });

        if (!organization) {
            throw new NotFoundException('Organización no encontrada');
        }

        if (userRole === 'ADMIN') {
            return 'ADMIN';
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
            throw new ForbiddenException('No tienes acceso a esta organización');
        }

        return membership.role;
    }

    private assertCanManageOrganization(actorRole: ActorOrgRole): void {
        if (actorRole === 'ADMIN') {
            return;
        }

        if (actorRole !== 'OWNER' && actorRole !== 'MANAGER') {
            throw new ForbiddenException('No tienes permisos para gestionar esta organización');
        }
    }

    private assertInvitePermission(actorRole: ActorOrgRole, inviteRole: OrganizationRole): void {
        if (actorRole === 'ADMIN') {
            return;
        }

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
