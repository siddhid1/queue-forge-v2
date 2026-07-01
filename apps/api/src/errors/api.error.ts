export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ResourceNotFoundError extends ApiError {
  constructor(resource: string, identifier: string) {
    super(`${resource} '${identifier}' was not found`, 404, "RESOURCE_NOT_FOUND");
  }
}

export class InvalidCursorError extends ApiError {
  constructor() {
    super("The pagination cursor is invalid", 400, "INVALID_CURSOR");
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

export class InvalidStateTransitionError extends ApiError {
  constructor(from: string, to: string) {
    super(`Cannot transition job from '${from}' to '${to}'`, 422, "INVALID_STATE_TRANSITION");
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Insufficient permissions") {
    super(message, 403, "FORBIDDEN");
  }
}
