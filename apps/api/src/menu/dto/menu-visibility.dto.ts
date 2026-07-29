import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, ValidateNested } from 'class-validator';
import { MENU_KEYS, MENU_ROLES } from '../menu-keys';

export class MenuVisibilityRowDto {
  @IsIn([...MENU_KEYS])
  menuKey!: string;

  @IsIn([...MENU_ROLES])
  role!: 'ADMIN' | 'APPROVER' | 'EMPLOYEE';

  @IsBoolean()
  visible!: boolean;
}

export class SaveMenuVisibilityDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuVisibilityRowDto)
  rows!: MenuVisibilityRowDto[];
}
