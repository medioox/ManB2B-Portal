"use client";
import { useApi } from "./hooks";
import type { Province } from "./types";

export function useProvinces() {
  return useApi<Province[]>("/provinces/");
}
