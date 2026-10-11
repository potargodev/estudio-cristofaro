ALTER TABLE "box_entries" DROP CONSTRAINT "box_entries_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "box_entries" DROP CONSTRAINT "box_entries_paid_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "box_entries" DROP CONSTRAINT "box_entries_goal_id_box_goals_id_fk";
--> statement-breakpoint
ALTER TABLE "box_transfers" DROP CONSTRAINT "box_transfers_from_box_id_boxes_id_fk";
--> statement-breakpoint
ALTER TABLE "box_transfers" DROP CONSTRAINT "box_transfers_to_box_id_boxes_id_fk";
