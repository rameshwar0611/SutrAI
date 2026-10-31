export function accountView(user) {
  return { _id: String(user._id), userId: String(user._id), name: user.name, email: user.email, avatar: user.avatar,
    plan: user.plan, credits: user.credits, totalCredits: user.totalCredits, planExpiresAt: user.planExpiresAt }
}
