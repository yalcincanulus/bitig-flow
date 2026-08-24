# Demo Users own isolated, disposable Organizations

Each one-click demo entry creates a credentialless **Demo User** as the sole owner of a new, isolated Organization, and the complete **Demo Environment** is deleted 24 hours after creation. Demo Users never share an Organization, never convert into durable Users, and may publish temporary Links so the real Viewer remains demonstrable.

This deliberately qualifies ADR-0010: Organization authorization remains a pure function of the existing owner, admin, and member Roles, but deployment policy may restrict a Demo User independently of Role. A fourth Role would confuse temporary deployment policy with standing inside an Organization, while a shared Organization would let unrelated reviewers see and destroy one another's work. Demo policy therefore forbids additional Organizations, Membership and Invitation changes, and email Requirements; quota and lifetime enforcement remain outside the Role matrix.
