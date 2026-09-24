export interface Sender {
  id: number;
  userId: number;
  email: string;
  name: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateSenderInput {
  userId: number;
  email: string;
  name?: string | null;
}

export interface UpdateSenderInput {
  email?: string;
  name?: string | null;
}
