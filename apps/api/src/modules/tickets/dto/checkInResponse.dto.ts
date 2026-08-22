import { ApiProperty } from '@nestjs/swagger';

import { CheckInResult } from '../checkInResult.enum';

export class CheckInResponseDto {
  @ApiProperty({ enum: CheckInResult })
  public result!: CheckInResult;

  public static fromResult(result: CheckInResult): CheckInResponseDto {
    return { result };
  }
}
