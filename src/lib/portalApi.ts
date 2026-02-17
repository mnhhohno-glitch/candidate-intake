// Portal API（社員・求職者マスター取得用）

const PORTAL_API_URL = process.env.NEXT_PUBLIC_PORTAL_API_URL || 'https://bizstudio-portal-production.up.railway.app'

export interface Employee {
  id: string
  employeeNo: string
  name: string
  status: 'active' | 'disabled'
}

export interface Candidate {
  id: string
  candidateNo: string
  name: string
  careerAdvisor: string | null
}

export async function fetchEmployees(): Promise<Employee[]> {
  const response = await fetch(`${PORTAL_API_URL}/api/employees`)
  if (!response.ok) {
    throw new Error('社員一覧の取得に失敗しました')
  }
  return response.json()
}

export async function fetchCandidates(): Promise<Candidate[]> {
  const response = await fetch(`${PORTAL_API_URL}/api/candidates`)
  if (!response.ok) {
    throw new Error('求職者一覧の取得に失敗しました')
  }
  return response.json()
}
