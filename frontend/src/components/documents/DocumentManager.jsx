// frontend/src/components/documents/DocumentManager.jsx
import { useState, useEffect } from 'react'
import { getDocuments, uploadDocument, getDocumentUrl, getTenants } from '../../lib/supabase'

export default function DocumentManager({ buildingId, tenantId, isOwner, uploadedBy }) {
  const [documents, setDocuments] = useState([])
  const [tenants, setTenants] = useState([])
  const [selectedTenantId, setSelectedTenantId] = useState(tenantId || '')
  const [docType, setDocType] = useState(isOwner ? 'rent_agreement' : 'id_proof')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOwner) loadTenants()
    if (selectedTenantId) loadDocuments()
  }, [buildingId, selectedTenantId])

  const loadTenants = async () => {
    const { data } = await getTenants(buildingId)
    setTenants(data || [])
    if (data?.length && !selectedTenantId) setSelectedTenantId(data[0].id)
  }

  const loadDocuments = async () => {
    if (!selectedTenantId) return
    const { data } = await getDocuments(selectedTenantId)
    setDocuments(data || [])
  }

  const handleUpload = async () => {
    if (!file || !selectedTenantId) {
      setError('Please select a file and tenant.')
      return
    }
    setUploading(true)
    setError('')

    const { error } = await uploadDocument({
      tenantId: selectedTenantId,
      buildingId,
      uploadedBy,
      docType,
      file,
    })

    if (error) setError(error.message)
    else {
      setFile(null)
      document.getElementById('doc-file-input').value = ''
      loadDocuments()
    }
    setUploading(false)
  }

  const handleDownload = async (doc) => {
    const url = await getDocumentUrl(doc.file_path)
    if (url) {
      const a = document.createElement('a')
      a.href = url
      a.download = doc.file_name
      a.click()
    }
  }

  const allowedUploadTypes = isOwner ? ['rent_agreement', 'other'] : ['id_proof']
  // Tenants can only see: their id_proof + rent_agreement (uploaded by owner)
  const visibleDocs = isOwner ? documents : documents.filter(
    (d) => d.doc_type === 'id_proof' || d.doc_type === 'rent_agreement'
  )

  return (
    <div className="manager-page">
      <div className="manager-header">
        <h3>Documents</h3>
      </div>

      {isOwner && tenants.length > 0 && (
        <div className="tenant-picker">
          <label>Select Tenant:</label>
          <select value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)}>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name} — Room {t.rooms?.room_number}</option>
            ))}
          </select>
        </div>
      )}

      <div className="upload-section">
        <h4>Upload Document</h4>
        <div className="upload-row">
          <select value={docType} onChange={(e) => setDocType(e.target.value)}>
            {allowedUploadTypes.map((t) => (
              <option key={t} value={t}>
                {t === 'id_proof' ? '🪪 ID Proof' : t === 'rent_agreement' ? '📄 Rent Agreement' : '📎 Other'}
              </option>
            ))}
          </select>
          <input
            id="doc-file-input"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={(e) => setFile(e.target.files[0])}
          />
          <button className="btn-primary" onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? 'Uploading...' : '⬆ Upload'}
          </button>
        </div>
        {error && <div className="error-msg">{error}</div>}
      </div>

      <div className="documents-list">
        <h4>Stored Documents ({visibleDocs.length})</h4>
        {visibleDocs.length === 0 && <div className="empty-state">No documents uploaded yet.</div>}
        {visibleDocs.map((doc) => (
          <div key={doc.id} className="document-item">
            <div className="doc-icon">
              {doc.mime_type?.includes('pdf') ? '📄' : doc.mime_type?.includes('image') ? '🖼️' : '📎'}
            </div>
            <div className="doc-info">
              <div className="doc-name">{doc.file_name}</div>
              <div className="doc-meta">
                <span className={`badge badge-${doc.doc_type}`}>
                  {doc.doc_type === 'id_proof' ? 'ID Proof' : doc.doc_type === 'rent_agreement' ? 'Rent Agreement' : 'Other'}
                </span>
                <span>{new Date(doc.created_at).toLocaleDateString('en-IN')}</span>
                {doc.file_size && <span>{(doc.file_size / 1024).toFixed(1)} KB</span>}
              </div>
            </div>
            <button className="btn-secondary" onClick={() => handleDownload(doc)}>
              ⬇ Download
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
