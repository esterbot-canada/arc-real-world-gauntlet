export async function fetchUser(fetchImpl, userId) {
  const response = await fetchImpl(`/api/users/${userId}`);

  if (!response.ok) {
    throw new Error('failed to fetch user');
  }

  return response.json();
}
