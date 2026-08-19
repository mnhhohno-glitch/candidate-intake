# candidate-intake ナレッジ

## 変更履歴・運用メモ

- 2026-08-19 T-170: `specs/generate_form_prompt.yaml` にサブカテゴリ 12 種を追加
  （service_food / service_cooking / service_beauty / service_hotel /
  mfg_production / mfg_construction / mfg_design /
  logi_driver / logi_warehouse /
  pro_instructor / pro_finance / pro_public）。
  大項目（製造・技術=manufacturing / 物流・運輸=logistics / 教育・専門=professional）の定義は
  candidate-intake 側には存在しない（YAML・コードとも）。表示用の大項目定義は portal 側のみ。
  **portal の `google-form-categories.ts` とサブカテゴリコードの同期必須。**
