import { ApplicationError } from './application.error';

export class ConfigurationError extends ApplicationError {
  public constructor(message: string, cause?: unknown) {
    super(message, undefined, 'CONFIGURATION_ERROR', cause);
  }
}
