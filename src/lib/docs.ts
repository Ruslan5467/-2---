import { getAccessToken } from './firebase';

export async function createGoogleDocWithContent(title: string, markdownContent: string) {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  // 1. Create a new blank Document
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: title
    })
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create doc: ${await createRes.text()}`);
  }

  const doc = await createRes.json();
  const documentId = doc.documentId;

  // 2. Insert content into the document
  const requests = [
    {
      insertText: {
        location: { index: 1 }, // Start at the beginning
        text: markdownContent
      }
    }
  ];

  const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  });

  if (!updateRes.ok) {
    throw new Error(`Failed to update doc: ${await updateRes.text()}`);
  }

  return documentId;
}
