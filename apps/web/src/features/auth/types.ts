export enum UserRole {
  Customer = 'CUSTOMER',
  Organizer = 'ORGANIZER',
  Gate = 'GATE',
}

export interface SessionUser {
  id: string;
  role: UserRole;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse extends SessionUser {
  email: string;
}

export interface SignupCredentials {
  email: string;
  password: string;
}

export interface SignupResponse {
  id: string;
  email: string;
  role: UserRole.Customer;
}
