export * from "../generated/client";
import { PrismaClient } from "../generated/client";

export function createPrismaClient() {
  return new PrismaClient();
}
