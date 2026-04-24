import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { Prisma, type BusinessClaimEvidenceType } from '../generated/prisma/client';

type ClaimRequestableBusinessRef = {
    deletedAt: Date | null;
    isClaimable: boolean;
    claimStatus: string;
};

type BuildCreatedClaimBusinessUpdateDataInput = {
    requesterUserId: string;
};

type BuildCreatedClaimRequestAuditMetadataInput = {
    businessId: string;
    businessSlug: string;
    evidenceType: BusinessClaimEvidenceType;
};

type BuildClaimRequestSubmittedGrowthMetadataInput = {
    claimRequestId: string;
    evidenceType: BusinessClaimEvidenceType;
};

type BuildCreatedClaimRequestCreateDataInput = {
    businessId: string;
    requesterUserId: string;
    requesterOrganizationId: string | null;
    evidenceType: BusinessClaimEvidenceType;
    evidenceValue: string | null;
    notes: string | null;
};

export function assertClaimRequestableBusiness<T extends ClaimRequestableBusinessRef>(
    business: T | null | undefined,
): T {
    if (!business || business.deletedAt) {
        throw new NotFoundException('Negocio no encontrado');
    }

    if (!business.isClaimable) {
        throw new BadRequestException('Este negocio no esta disponible para reclamacion');
    }

    if (business.claimStatus === 'CLAIMED') {
        throw new BadRequestException('Este negocio ya fue reclamado');
    }

    return business;
}

export function assertNoActiveOwnershipClaimConflict<T>(
    activeOwnership: T | null | undefined,
): void {
    if (activeOwnership) {
        throw new ConflictException('Este negocio ya tiene un ownership activo');
    }
}

export function assertNoActiveClaimRequestConflict<T>(
    existingPendingRequest: T | null | undefined,
): void {
    if (existingPendingRequest) {
        throw new ConflictException('Ya existe una solicitud de reclamacion pendiente para este negocio');
    }
}

export function buildCreatedClaimBusinessUpdateData(
    input: BuildCreatedClaimBusinessUpdateDataInput,
): Prisma.BusinessUncheckedUpdateInput {
    return {
        claimStatus: 'PENDING_CLAIM',
        updatedByUserId: input.requesterUserId,
    };
}

export function buildCreatedClaimRequestAuditMetadata(
    input: BuildCreatedClaimRequestAuditMetadataInput,
): Prisma.InputJsonValue {
    return {
        businessId: input.businessId,
        businessSlug: input.businessSlug,
        evidenceType: input.evidenceType,
    } satisfies Prisma.InputJsonObject;
}

export function buildClaimRequestSubmittedGrowthMetadata(
    input: BuildClaimRequestSubmittedGrowthMetadataInput,
): Prisma.InputJsonValue {
    return {
        claimRequestId: input.claimRequestId,
        evidenceType: input.evidenceType,
    } satisfies Prisma.InputJsonObject;
}

export function buildCreatedClaimRequestCreateData(
    input: BuildCreatedClaimRequestCreateDataInput,
): Prisma.BusinessClaimRequestUncheckedCreateInput {
    return {
        businessId: input.businessId,
        requesterUserId: input.requesterUserId,
        requesterOrganizationId: input.requesterOrganizationId,
        evidenceType: input.evidenceType,
        evidenceValue: input.evidenceValue,
        notes: input.notes,
    };
}
