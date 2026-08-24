/**
 * Dev report API 的构建工具无关当前契约。
 *
 * @module devtools/protocol
 */
import type { BuildAnalysis } from '@semantic-atomic-css/analyzer';
import type { TransformReport } from '@semantic-atomic-css/core';

/** dev API 中单个构建 environment 的稳定 report 快照。 */
export type DevReportEnvironment = {
  /** 构建工具提供的 environment 名；单 environment adapter 使用 `client`。 */
  name: string;
  /** 沿用 build asset 的 core report 与 analyzer analysis，不改变 nested report。 */
  report: TransformReport & { analysis: BuildAnalysis };
};

/** Vite 与 Rsbuild 共用的 dev report API envelope。 */
export type DevReportEnvelope = {
  /** 产生当前快照的 adapter。 */
  adapter: 'vite' | 'rsbuild';
  /** 尚无已转换模块时为 `idle`，否则为 `ready`。 */
  status: 'idle' | 'ready';
  /** 按 name 稳定排序的 environment reports。 */
  environments: DevReportEnvironment[];
};

/**
 * 创建字段顺序和 environment 顺序稳定的 dev report envelope。
 *
 * @param adapter - 当前 adapter 名。
 * @param environments - 当前可用的 environment report 快照。
 * @returns 可直接 JSON 序列化的当前协议对象。
 */
export function createDevReportEnvelope(
  adapter: DevReportEnvelope['adapter'],
  environments: DevReportEnvironment[]
): DevReportEnvelope {
  const stableEnvironments = [...environments]
    .sort((left, right) => compareText(left.name, right.name))
    .map(({ name, report }) => ({ name, report }));

  return {
    adapter,
    status: stableEnvironments.length === 0 ? 'idle' : 'ready',
    environments: stableEnvironments
  };
}

/** 判断 URL pathname 是否精确命中 dev report endpoint。 */
export function matchesDevReportRequest(requestUrl: string | undefined, endpoint: string): boolean {
  if (!requestUrl) {
    return false;
  }

  try {
    return new URL(requestUrl, 'http://semantic-atomic-css.local').pathname === endpoint;
  } catch {
    return false;
  }
}

/** 校验 endpoint 是不含 query/hash/HTML 控制字符的绝对 pathname。 */
export function isValidDevReportEndpoint(endpoint: string): boolean {
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(endpoint) || endpoint.includes('//')) {
    return false;
  }

  try {
    return new URL(endpoint, 'http://semantic-atomic-css.local').pathname === endpoint;
  } catch {
    return false;
  }
}

/** 以不受 locale 影响的字典序比较稳定协议字段。 */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
