# Security Spec

## Data Invariants
1. A bot model cannot exist without a valid UserProfile that belongs to the user.
2. A user profile's createdAt must exactly match the server timestamp upon creation.
3. Bot models are immutable after creation.
4. User profiles can only update `displayName` and `updatedAt`.

## Dirty Dozen Payloads
1. Create user profile for another uid.
2. Create user profile with missing `createdAt` field.
3. Update user profile to modify `createdAt`.
4. Update user profile with extra fields.
5. Create bot model for missing user profile.
6. Create bot model with sizes/arrays exceeding max.
7. Update bot model (immutability check).
8. Read bot model belonging to someone else.
9. List bot models without auth.
10. Delete bot model from another user.
11. Read user profile for another user.
12. Create bot model with incorrect types.
