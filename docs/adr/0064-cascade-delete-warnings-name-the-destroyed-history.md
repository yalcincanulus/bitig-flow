# Cascade delete warnings name the destroyed history

Deleting a **Link** destroys its **Visits** and **Events**. Deleting a **Document** destroys its Events while leaving the Visits in place, so a Link's **Total time** simply shrinks. ADR-0006 already chose cascade over soft-delete; this is the point at which that choice has a visible cost.

The interface says so with two sentences rather than a schema change. The Link delete dialog names the count of Visits being destroyed, says the action cannot be undone, and points at deactivating the Link as the way to stop new Visits without destroying history. The Document delete dialog names the consequence without a count — its analytics history goes, and Links including it will show less activity — because that dialog lives on the Documents list and a count would be one query per row.
