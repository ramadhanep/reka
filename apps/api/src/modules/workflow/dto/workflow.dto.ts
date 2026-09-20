import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'
import type { WorkflowDefinitionStatus } from '@reka/contracts'

export class StateItemDto {
  @IsString()
  @IsNotEmpty()
  key!: string

  @IsString()
  @IsNotEmpty()
  name!: string

  @IsOptional()
  @IsBoolean()
  isInitial?: boolean

  @IsOptional()
  @IsBoolean()
  isTerminal?: boolean

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class TransitionItemDto {
  @IsString()
  @IsNotEmpty()
  key!: string

  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsNotEmpty()
  fromStateKey!: string

  @IsString()
  @IsNotEmpty()
  toStateKey!: string

  @IsOptional()
  @IsString()
  requiredPermission?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

export class CreateWorkflowDefinitionBodyDto {
  @IsString()
  @IsNotEmpty()
  key!: string

  @IsString()
  @IsNotEmpty()
  name!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StateItemDto)
  states!: StateItemDto[]

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransitionItemDto)
  transitions!: TransitionItemDto[]
}

export class UpdateWorkflowDefinitionBodyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsIn(['draft', 'active', 'archived'])
  status?: WorkflowDefinitionStatus

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StateItemDto)
  states?: StateItemDto[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransitionItemDto)
  transitions?: TransitionItemDto[]
}

export class CreateWorkflowInstanceBodyDto {
  @IsOptional()
  @IsString()
  workflowDefinitionId?: string

  @IsOptional()
  @IsString()
  workflowDefinitionKey?: string

  @IsString()
  @IsNotEmpty()
  subjectType!: string

  @IsString()
  @IsNotEmpty()
  subjectId!: string
}

export class ExecuteTransitionBodyDto {
  @IsOptional()
  @IsString()
  comment?: string

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}
