# The viewer has its own control scale

Every interactive control on `/v/*` — inputs, buttons, the resend affordance, Vault list rows — has a minimum height of 44px. The Dashboard keeps the compact shadcn defaults, whose largest button size is 32px.

The two surfaces have different audiences and the same component library cannot serve both honestly. The Dashboard is a dense tool used repeatedly by an invited member of an Organization, usually on a laptop, where 32px controls buy information density that a returning user wants. The Viewer is opened once, on a phone, from an email, by a stranger who will never see it again — where a 32px tap target is a miss and a retry, and density buys nothing because there is one question on the screen.

This is a rule about the Viewer, not a theme fork: the same tokens, colours, radii, and font apply. Only the sizing scale differs, and only on `/v/*`. In practice it means Viewer components pass explicit heights rather than relying on the library's `size` variants, which is the visible seam that keeps the rule enforceable — a Viewer control using a bare `<Button size="lg">` is wrong on sight.

Raising the shared defaults instead was rejected: it would make the Dashboard less dense than the component library intends in order to fix a surface with four screens, and it would silently re-lay-out every future Dashboard view.

The 44px figure is the platform accessibility guidance both Apple and WCAG land near, and it is the number to cite when a control looks oversized next to its Dashboard sibling. It is expected to look oversized. The Dashboard is the surface being compared against, and it is not the one the Visitor is on.
