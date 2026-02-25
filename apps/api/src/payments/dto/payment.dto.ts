import { IsInt, IsOptional, Min } from 'class-validator';

export class ListPaymentsQueryDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    limit?: number;
}
