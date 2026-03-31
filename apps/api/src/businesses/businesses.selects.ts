import { Prisma } from '../generated/prisma/client';

export const businessImageOrderBy: Prisma.BusinessImageOrderByWithRelationInput[] = [
    { isCover: Prisma.SortOrder.desc },
    { sortOrder: Prisma.SortOrder.asc },
    { id: Prisma.SortOrder.asc },
];

export const businessHoursOrderBy: Prisma.BusinessHourOrderByWithRelationInput = {
    dayOfWeek: Prisma.SortOrder.asc,
};

export const fullBusinessInclude = {
    owner: {
        select: { id: true, name: true },
    },
    organization: {
        select: { id: true, name: true, slug: true },
    },
    province: {
        select: { id: true, name: true, slug: true },
    },
    city: {
        select: { id: true, name: true, slug: true },
    },
    sector: {
        select: { id: true, name: true, slug: true },
    },
    categories: {
        include: {
            category: {
                select: { id: true, name: true, slug: true, icon: true, parentId: true },
            },
        },
    },
    images: {
        orderBy: businessImageOrderBy,
    },
    hours: {
        orderBy: businessHoursOrderBy,
    },
    features: {
        include: {
            feature: {
                select: { id: true, name: true },
            },
        },
    },
    _count: {
        select: { reviews: true },
    },
} satisfies Prisma.BusinessInclude;

export const approvedBusinessReviewsInclude = {
    where: {
        moderationStatus: 'APPROVED',
        isSpam: false,
    },
    include: {
        user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
} as const satisfies Prisma.Business$reviewsArgs;

export const fullBusinessDetailInclude = {
    ...fullBusinessInclude,
    reviews: approvedBusinessReviewsInclude,
} satisfies Prisma.BusinessInclude;

export const publicListBusinessSelect = {
    id: true,
    name: true,
    slug: true,
    description: true,
    address: true,
    priceRange: true,
    latitude: true,
    longitude: true,
    verified: true,
    reputationScore: true,
    verificationStatus: true,
    province: {
        select: { id: true, name: true, slug: true },
    },
    city: {
        select: { id: true, name: true, slug: true },
    },
    sector: {
        select: { id: true, name: true, slug: true },
    },
    categories: {
        select: {
            category: {
                select: { id: true, name: true, slug: true, icon: true, parentId: true },
            },
        },
    },
    images: {
        select: { id: true, url: true, isCover: true, caption: true, type: true },
        orderBy: businessImageOrderBy,
        take: 1,
    },
    hours: {
        select: {
            dayOfWeek: true,
            opensAt: true,
            closesAt: true,
            closed: true,
        },
        orderBy: businessHoursOrderBy,
    },
    _count: {
        select: { reviews: true },
    },
} satisfies Prisma.BusinessSelect;

export const adminListBusinessSelect = {
    id: true,
    name: true,
    slug: true,
    verified: true,
    verificationStatus: true,
    createdAt: true,
    phone: true,
    website: true,
    email: true,
    owner: {
        select: { id: true, name: true },
    },
    organization: {
        select: { id: true, name: true, slug: true },
    },
    province: {
        select: { id: true, name: true, slug: true },
    },
    city: {
        select: { id: true, name: true, slug: true },
    },
    sector: {
        select: { id: true, name: true, slug: true },
    },
    categories: {
        select: {
            category: {
                select: { id: true, name: true, slug: true, icon: true, parentId: true },
            },
        },
    },
    images: {
        select: { id: true, url: true, isCover: true },
        orderBy: businessImageOrderBy,
        take: 1,
    },
    hours: {
        select: {
            dayOfWeek: true,
            opensAt: true,
            closesAt: true,
            closed: true,
        },
        orderBy: businessHoursOrderBy,
    },
    _count: {
        select: { reviews: true },
    },
} satisfies Prisma.BusinessSelect;

export const mineListBusinessSelect = {
    id: true,
    name: true,
    slug: true,
    verified: true,
    verificationStatus: true,
    city: {
        select: { id: true, name: true, slug: true },
    },
    sector: {
        select: { id: true, name: true, slug: true },
    },
    categories: {
        select: {
            category: {
                select: { id: true, name: true, slug: true, parentId: true },
            },
        },
    },
    images: {
        select: { id: true, url: true, isCover: true },
        orderBy: businessImageOrderBy,
        take: 1,
    },
    hours: {
        select: {
            dayOfWeek: true,
            opensAt: true,
            closesAt: true,
            closed: true,
        },
        orderBy: businessHoursOrderBy,
    },
    phone: true,
    website: true,
    email: true,
    latitude: true,
    longitude: true,
    _count: {
        select: { reviews: true },
    },
} satisfies Prisma.BusinessSelect;

export const catalogQualityBusinessSelect = {
    id: true,
    name: true,
    slug: true,
    verified: true,
    createdAt: true,
    phone: true,
    website: true,
    email: true,
    address: true,
    latitude: true,
    longitude: true,
    province: {
        select: { id: true, name: true, slug: true },
    },
    city: {
        select: { id: true, name: true, slug: true },
    },
    sector: {
        select: { id: true, name: true, slug: true },
    },
    categories: {
        select: {
            category: {
                select: { id: true, name: true, slug: true, parentId: true },
            },
        },
    },
    images: {
        select: { id: true, url: true, isCover: true },
        orderBy: businessImageOrderBy,
    },
    hours: {
        select: {
            dayOfWeek: true,
            opensAt: true,
            closesAt: true,
            closed: true,
        },
        orderBy: businessHoursOrderBy,
    },
} satisfies Prisma.BusinessSelect;
