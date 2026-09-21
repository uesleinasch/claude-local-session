import type { Status } from '../src/status-core'

export type Action = { bin: string; args: string[]; label: string }

export declare const ACTIONS: Record<string, Action>
export declare function actionIds(): string[]
export declare function actionLabel(id: string): string | null
export declare function resolveAction(
  id: string,
  selfPath: string,
): { bin: string; args: string[] } | null
export declare function resolveBinary(
  candidates: readonly (string | null | undefined)[],
  isExecutable: (path: string) => boolean,
): string | null
export declare function healthLabel(health: string): string
export declare function trayTooltip(status: Status | null): string
export declare function problemCount(status: Status | null): number
export declare function autostartEntry(execPath: string): string
