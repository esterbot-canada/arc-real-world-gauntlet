export async function fetchUser(fetchImpl, userId) {
  let response = await fetchImpl(`/api/users/${userId}`);

  if (!response.ok) {
    response = await fetchImpl(`/api/users/${userId}`);
  }

  if (!response.ok) {
    throw new Error('failed to fetch user');
  }

  return response.json();
}
