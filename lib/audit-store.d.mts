import {AsyncLocalStorage} from 'node:async_hooks';
import type {AuditContext} from './audit-context';
export const context:AsyncLocalStorage<AuditContext>;
