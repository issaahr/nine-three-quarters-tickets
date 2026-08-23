import { IsEnum, IsOptional } from 'class-validator';

import { AdmissionMode } from '../../events/admissionMode.enum';

export class ListVenuesQueryDto {
  @IsOptional()
  @IsEnum(AdmissionMode, { message: 'Modalidade de admissão inválida' })
  public admissionMode?: AdmissionMode;
}
