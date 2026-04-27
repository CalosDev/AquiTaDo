import type { CheckInStats } from './types';

type BusinessCheckInStatsGridProps = {
    stats: CheckInStats | null;
};

export function BusinessCheckInStatsGrid({ stats }: BusinessCheckInStatsGridProps) {
    return (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg bg-white border border-accent-100 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Check-ins</p>
                <p className="text-base font-semibold text-gray-900">
                    {stats?.totalCheckIns ?? 0}
                </p>
            </div>
            <div className="rounded-lg bg-white border border-accent-100 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Ult 24h</p>
                <p className="text-base font-semibold text-gray-900">
                    {stats?.last24HoursCheckIns ?? 0}
                </p>
            </div>
            <div className="rounded-lg bg-white border border-accent-100 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">GPS verif.</p>
                <p className="text-base font-semibold text-gray-900">
                    {stats?.verifiedCheckIns ?? 0}
                </p>
            </div>
            <div className="rounded-lg bg-white border border-accent-100 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Usuarios</p>
                <p className="text-base font-semibold text-gray-900">
                    {stats?.uniqueUsers ?? 0}
                </p>
            </div>
        </div>
    );
}
