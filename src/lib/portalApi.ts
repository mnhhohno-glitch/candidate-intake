// Portal API（社員マスター取得用）

const PORTAL_API_URL = process.env.NEXT_PUBLIC_PORTAL_API_URL || 'https://bizstudio-portal-production.up.railway.app'

export interface Employee {
  id: string
  employeeNo: string
  name: string
  status: 'active' | 'disabled'
}

export async function fetchEmployees(): Promise<Employee[]> {
  const response = await fetch(`${PORTAL_API_URL}/api/employees`)
  if (!response.ok) {
    throw new Error('社員一覧の取得に失敗しました')
  }
  return response.json()
}
