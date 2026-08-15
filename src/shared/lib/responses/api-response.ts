import { HttpStatus } from '@nestjs/common';

export class ApiResponse {
  message: string;
  data: object;
  status: HttpStatus;

  static successResponse(
    message: string,
    data: object = {},
    status = HttpStatus.OK,
  ): ApiResponse {
    return {
      message,
      data,
      status,
    };
  }
}
