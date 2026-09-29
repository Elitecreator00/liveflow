import { IsString, IsArray, ArrayMinSize } from 'class-validator';

export class GoLiveDto {
  @IsString()
  creatorId!: string;

  /** IDs of ConnectedAccount records to include in this session */
  @IsArray()
  @ArrayMinSize(1)
  connectedAccountIds!: string[];
}
