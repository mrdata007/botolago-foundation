import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  AdminControlPlaneRepository,
  ApprovalQueueFilter,
  AssignmentReviewFilter,
  AuditInspectionFilter,
} from "./control-plane-contracts";

export class AdminControlPlaneService {
  constructor(private readonly repository: AdminControlPlaneRepository) {}

  getCurrentStaffContext(context: RepositoryContext) {
    return this.repository.getCurrentStaffContext(context);
  }

  listAssignments(
    filter: AssignmentReviewFilter,
    cursor: Parameters<AdminControlPlaneRepository["listAssignments"]>[1],
    limit: number,
    context: RepositoryContext,
  ) {
    return this.repository.listAssignments(filter, cursor, limit, context);
  }

  listApprovals(
    filter: ApprovalQueueFilter,
    cursor: Parameters<AdminControlPlaneRepository["listApprovals"]>[1],
    limit: number,
    context: RepositoryContext,
  ) {
    return this.repository.listApprovals(filter, cursor, limit, context);
  }

  listAudit(
    filter: AuditInspectionFilter,
    cursor: Parameters<AdminControlPlaneRepository["listAudit"]>[1],
    limit: number,
    context: RepositoryContext,
  ) {
    return this.repository.listAudit(filter, cursor, limit, context);
  }

  listRoleCatalog(context: RepositoryContext) {
    return this.repository.listRoleCatalog(context);
  }
}
