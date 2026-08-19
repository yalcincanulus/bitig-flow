# Viewer identity is deliberately non-transitive

A Visit's Viewer identity is `email ?? visitor_id`, and distinct identities are counted without a transitive merge. One Visitor id therefore splits when an email is captured partway through its history, and two Visitor ids remain separate when only one captured an email they share; connected-component identity would need machinery and certainty the product cannot justify. This replaces ADR-0029's `COUNT(DISTINCT visitor_id)` definition of unique visitors.
