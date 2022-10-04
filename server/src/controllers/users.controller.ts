import {
  Get,
  Body,
  Controller,
  Post,
  Patch,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { Express } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { PasswordRevalidateGuard } from 'src/modules/auth/password-revalidate.guard';
import { UsersService } from 'src/services/users.service';
import { User } from 'src/decorators/user.decorator';
import { UpdateUserDto } from '@dto/user.dto';
import { decamelizeKeys } from 'humps';
import { UserCountGuard } from '@ee/licensing/guards/user.guard';
import { getManager } from 'typeorm';
import { SuperAdminGuard } from 'src/modules/auth/super-admin.guard';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Get('all')
  async getAllUsers(@Query() query) {
    const { page, email, firstName, lastName } = query;
    const filterOptions = {
      ...(email && { email }),
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
    };
    const usersCount = await this.usersService.instanceUsersCount(filterOptions);
    let users = [];
    if (usersCount > 0) users = await this.usersService.findInstanceUsers(page, filterOptions);

    const meta = {
      total_pages: Math.ceil(usersCount / 10),
      total_count: usersCount,
      current_page: parseInt(page || 1),
    };

    const response = {
      meta,
      users,
    };
    return decamelizeKeys(response);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('update')
  async update(@User() user, @Body() updateUserDto: UpdateUserDto) {
    const { first_name: firstName, last_name: lastName } = updateUserDto;
    await this.usersService.update(user.id, { firstName, lastName });
    await user.reload();
    return {
      first_name: user.firstName,
      last_name: user.lastName,
    };
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Patch('/user-type')
  async updateUserTypr(@Body() body) {
    const { userType, userId } = body;

    if (!userType || !userId) {
      throw new BadRequestException();
    }
    if (userType === 'workspace') {
      const instanceUsers = await this.usersService.findSuperAdmins();
      if (instanceUsers.length === 1 && instanceUsers[0].id === userId) {
        throw new Error('At least one super admin is required');
      }
    }
    return await this.usersService.updateUser(userId, { userType });
  }

  @UseGuards(JwtAuthGuard, UserCountGuard)
  @Get('license-terms')
  async getUserCount() {
    return;
  }

  // Not used by UI, uses for testing
  @UseGuards(JwtAuthGuard)
  @Get('license-terms/terms')
  async getTerms() {
    const manager = getManager();
    const { editor, viewer } = await this.usersService.fetchTotalViewerEditorCount(manager);
    const totalActive = await this.usersService.getCount(true);
    const total = await this.usersService.getCount();
    return { editor, viewer, totalActive, total };
  }

  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async addAvatar(@User() user, @UploadedFile() file: Express.Multer.File) {
    return this.usersService.addAvatar(user.id, file.buffer, file.originalname);
  }

  @UseGuards(JwtAuthGuard, PasswordRevalidateGuard)
  @Patch('change_password')
  async changePassword(@User() user, @Body('newPassword') newPassword) {
    return await this.usersService.update(user.id, {
      password: newPassword,
    });
  }
}
