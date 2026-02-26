import { IsUUID } from 'class-validator';

export class UploadBusinessImageDto {
    @IsUUID()
    businessId!: string;
}
