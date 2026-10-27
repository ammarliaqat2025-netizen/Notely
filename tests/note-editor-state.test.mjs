import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidClientNoteId, mergeCreatedNote, shouldApplyRemoteNote, shouldStartCreation, versionNeedsPersist } from '../lib/note-editor-state.js'

test('creation response merges optimistic draft and realtime INSERT into one note', () => {
  const optimistic = { id: 'temp-key', title: 'Draft' }
  const realtime = { id: 'server-id', title: '' }
  const resolved = { id: 'server-id', title: 'Draft' }

  const notes = mergeCreatedNote([realtime, optimistic], 'temp-key', resolved)

  assert.equal(notes.length, 1)
  assert.deepEqual(notes[0], resolved)
})

test('remote note update cannot overwrite a title being edited', () => {
  assert.equal(shouldApplyRemoteNote('note-1', 'note-1', { title: true, body: false }), false)
})

test('remote note update cannot overwrite a body being edited', () => {
  assert.equal(shouldApplyRemoteNote('note-1', 'note-1', { title: false, body: true }), false)
})

test('remote update applies to the active note when no local edits are dirty', () => {
  assert.equal(shouldApplyRemoteNote('note-1', 'note-1', { title: false, body: false }), true)
  assert.equal(shouldApplyRemoteNote('note-1', 'note-2', { title: false, body: false }), false)
})

test('client creation id accepts UUIDs and rejects malformed keys', () => {
  assert.equal(isValidClientNoteId('2b2efaf0-1a23-4c56-8def-123456789abc'), true)
  assert.equal(isValidClientNoteId('../../other-user-note'), false)
  assert.equal(isValidClientNoteId(null), false)
})

test('a pending create action blocks a second creation request', () => {
  assert.equal(shouldStartCreation(false), true)
  assert.equal(shouldStartCreation(true), false)
})

test('a separate create action is allowed after the prior request finishes', () => {
  assert.equal(shouldStartCreation(false), true)
})

test('version persistence detects title-only edits', () => {
  assert.equal(versionNeedsPersist({ title: 'Old', body: 'same' }, { title: 'New', body: 'same' }), true)
})

test('version persistence detects body edits but skips unchanged documents', () => {
  assert.equal(versionNeedsPersist({ title: 'Same', body: 'Old' }, { title: 'Same', body: 'New' }), true)
  assert.equal(versionNeedsPersist({ title: 'Same', body: 'Same' }, { title: 'Same', body: 'Same' }), false)
})
