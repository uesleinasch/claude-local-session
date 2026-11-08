export type Apk = { versao: string; url: string; tamanho: number }

export declare function escolherApk(releases: unknown): Apk | null
