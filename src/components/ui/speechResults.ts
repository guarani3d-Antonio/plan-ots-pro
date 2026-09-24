export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

// Android WebKit may repeat a growing phrase in successive result slots, with
// different punctuation or accents. Compare spoken words rather than the raw
// strings so an updated hypothesis replaces its predecessor.
const spokenWords = (text: string) => (text.toLocaleLowerCase('es').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').match(/[\p{L}\p{N}]+/gu) ?? []);

export function joinSpeechResults(results: ArrayLike<SpeechRecognitionResultLike>): string {
  let transcript = '';
  for (let i = 0; i < results.length; i += 1) {
    const part = (results[i][0]?.transcript ?? '').trim();
    if (!part) continue;
    const previousWords = spokenWords(transcript);
    const nextWords = spokenWords(part);
    if (!previousWords.length) {
      transcript = part;
    } else if (previousWords.every((word, index) => nextWords[index] === word)) {
      transcript = part;
    } else if (nextWords.every((word, index) => previousWords[index] === word)) {
      continue;
    } else {
      let overlap = 0;
      for (let count = Math.min(previousWords.length, nextWords.length); count > 0; count -= 1) {
        if (previousWords.slice(-count).every((word, index) => word === nextWords[index])) {
          overlap = count;
          break;
        }
      }
      const remaining = part.split(/\s+/).slice(overlap).join(' ');
      transcript = remaining ? `${transcript} ${remaining}` : transcript;
    }
  }
  return transcript;
}
