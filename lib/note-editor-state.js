/** Pure state helpers shared by the note editor and its regression tests. */

/**
 * @template { { id: string } } T
 * @param {T[]} notes
 * @param {string} temporaryId
 * @param {T} resolvedNote
 * @returns {T[]}
 */
export function mergeCreatedNote(notes, temporaryId, resolvedNote) {
  return [resolvedNote, ...notes.filter(note => note.id !== temporaryId && note.id !== resolvedNote.id)]
}

/**
 * @param {string | null} activeId
 * @param {string} incomingId
 * @param {{ title: boolean, body: boolean }} dirtyFields
 */
export function shouldApplyRemoteNote(activeId, incomingId, dirtyFields) {
  return activeId === incomingId && !dirtyFields.title && !dirtyFields.body
}

/** @param {unknown} value @returns {value is string} */
export function isValidClientNoteId(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
