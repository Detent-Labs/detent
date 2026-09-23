/**
 * Runtime API Layer: the library boundary a UI (or, later, an HTTP server) can
 * call to run an instance without touching engine internals — create an
 * instance, resolve "what to display" for one, and submit data while
 * triggering a manual path. Not a transport: plain async TS functions.
 *
 * Callers never touch `ProcessBody` directly — only `processId`/`instanceId`.
 * This module resolves bodies internally via its own `createDefinitionStore`.
 */

import { PinMismatch } from "../engine/store.js";
import {
  GuardRefused,
  ConcurrencyConflict,
  AutomaticCascadeLoop,
  NotAssignedError,
  NotACandidateError,
  AlreadyClaimedError,
  NotClaimedError,
  NotClaimantError,
  UnknownDelegateError,
} from "../engine/transition.js";
import { NotFoundError, InstanceNotRunningError } from "../errors.js";
import type { InstanceDraft } from "../engine/instance-drafts.js";

export {
  GuardRefused,
  ConcurrencyConflict,
  AutomaticCascadeLoop,
  PinMismatch,
  NotAssignedError,
  NotACandidateError,
  AlreadyClaimedError,
  NotClaimedError,
  NotClaimantError,
  UnknownDelegateError,
  NotFoundError,
  InstanceNotRunningError,
};
export type { InstanceDraft };
export {
  MAX_LIST_LIMIT,
  MAX_RECORD_LIMIT,
  resolveCollaboration,
  CollaborationDisabledError,
} from "./internal.js";
export type { Page } from "./internal.js";
export {
  isResolvedViewField,
  SubmissionValidationError,
} from "./fields.js";
export type {
  ResolvedViewField,
  ResolvedViewNote,
  ResolvedViewEntry,
  ResolvedViewTab,
  AvailablePath,
  SubmissionIssue,
  DroppedAttribute,
} from "./fields.js";
export {
  createProcessInstance,
  getInstanceView,
  submitAndTransition,
  saveInstanceDraft,
  isCancellableAtStep,
  cancelInstance,
} from "./instances.js";
export type { InstanceView } from "./instances.js";
export { claimStep, releaseClaim, delegateClaim } from "./claims.js";
export { buildInstanceWhere, buildDataWhere, buildVisibleRowSet, listInstances, queryInstances, VERSION_MIN, VERSION_MAX } from "./queries.js";
export type {
  InstanceSummary,
  DegradedInstanceSummary,
  InstanceSummaryItem,
  DataComparison,
  InstanceListFilter,
  InstanceQueryFilter,
  InstanceDataItem,
  InstanceDataPage,
} from "./queries.js";
export {
  createReport,
  updateReport,
  deleteReport,
  getReport,
  listMyReports,
  resolveReportColumnChoices,
  previewReportColumnChoices,
  executeReport,
  previewReportDraft,
  reportResultToCsv,
  ReportOwnerInvariantError,
} from "./reports.js";
export type {
  ReportQuery,
  ReportColumn,
  Report,
  ReportInput,
  ReportPatch,
  ColumnChoice,
  ReportCell,
  MergeReportCell,
  ReportResultColumn,
  ReportExecutionRow,
  ReportExecutionResult,
} from "./reports.js";
export { getInstanceRecord } from "./record.js";
export type { InstanceRecordElement } from "./record.js";
export { revokeVisibility, restoreVisibility, grantVisibility } from "./visibility.js";
export type { VisibilityOp } from "./visibility.js";
export { postComment, listComments } from "./comments.js";
export type { InstanceComment } from "./comments.js";
export { uploadAttachment, listAttachments, getAttachment } from "./attachments.js";
export type { InstanceAttachment } from "./attachments.js";
