import type { BusinessHourEntry } from '../lib/businessProfile';
import { BUSINESS_DAY_OPTIONS } from '../lib/businessProfile';

type BusinessHoursEditorProps = {
    hours: BusinessHourEntry[];
    onChange: (nextHours: BusinessHourEntry[]) => void;
};

export function BusinessHoursEditor({ hours, onChange }: BusinessHoursEditorProps) {
    const updateHour = (
        dayOfWeek: number,
        updater: (current: BusinessHourEntry) => BusinessHourEntry,
    ) => {
        onChange(hours.map((entry) => (
            entry.dayOfWeek === dayOfWeek ? updater(entry) : entry
        )));
    };

    return (
        <div className="space-y-3">
            {BUSINESS_DAY_OPTIONS.map((day) => {
                const entry = hours.find((hour) => hour.dayOfWeek === day.dayOfWeek);
                if (!entry) {
                    return null;
                }

                return (
                    <div
                        key={day.dayOfWeek}
                        className="grid grid-cols-[110px,1fr,1fr,auto] items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-3"
                    >
                        <div className="text-sm font-medium text-gray-800">{day.label}</div>
                        <input
                            type="time"
                            className="input-field text-sm"
                            value={entry.opensAt}
                            onChange={(event) => updateHour(day.dayOfWeek, (current) => ({
                                ...current,
                                opensAt: event.target.value,
                            }))}
                            disabled={entry.closed}
                        />
                        <input
                            type="time"
                            className="input-field text-sm"
                            value={entry.closesAt}
                            onChange={(event) => updateHour(day.dayOfWeek, (current) => ({
                                ...current,
                                closesAt: event.target.value,
                            }))}
                            disabled={entry.closed}
                        />
                        <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                            <input
                                type="checkbox"
                                checked={entry.closed}
                                onChange={(event) => updateHour(day.dayOfWeek, (current) => ({
                                    ...current,
                                    closed: event.target.checked,
                                }))}
                            />
                            Cerrado
                        </label>
                    </div>
                );
            })}
        </div>
    );
}
