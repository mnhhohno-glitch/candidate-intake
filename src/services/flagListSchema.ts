/**
 * フラグリストの選択肢をEnumとして定義
 * Gemini API の responseSchema で使用
 * 
 * 注意: additionalProperties は Gemini API でサポートされないため使用しない
 */

export const FLAG_ENUMS = {
  エージェント利用フラグ: ["現在も利用中", "過去に利用有", "初めて利用"],
  転職時期フラグ: ["すぐにでも", "3カ月以内", "半年以内", "情報収集"],
  転職活動期間フラグ: ["1週間以内", "2週間以内", "1ヵ月以内", "2カ月以内", "3ヶ月以内", "半年以内", "半年以上"],
  応募種別フラグ: ["応募済み", "応募なし", "検討中"],
  学歴フラグ: ["中卒", "高校卒", "高専卒", "短大・専門卒", "大学卒", "大学院卒"],
  希望曜日フラグ: ["土日祝休み", "平日休み", "シフト制", "問わず"],
  希望最大残業フラグ: ["不可", "5時間以内", "10時間以内", "15時間以内", "20時間以内", "30時間以内", "40時間以内"],
  希望転勤フラグ: ["あり", "なし"],
  自動車免許フラグ: ["取得", "取得(AT限定)", "無し"],
  語学フラグ: ["不可", "英語", "中国語", "スペイン語", "フランス語", "ドイツ語", "韓国語", "ポルトガル語", "アラビア語", "ロシア語", "ヒンディー語"],
  語学スキルフラグ: ["ネイティブレベル", "ビジネスレベル", "日常会話レベル", "不可"],
  日本語スキルフラグ: ["－", "N1取得_ネイティブレベル", "N1取得_ビジネスレベル", "N1取得_日常会話レベル", "資格未取得_ネイティブレベル", "資格未取得_ビジネスレベル", "資格未取得_日常会話レベル", "不可"],
  PCスキル_タイピングフラグ: ["ブラインドタッチ可", "見ながら両手打ち可", "片手打ちレベル"],
  PCスキル_Excelフラグ: ["不可", "初級", "中級", "上級"],
  PCスキル_Wordフラグ: ["不可", "初級", "中級", "上級"],
  PCスキル_PPTフラグ: ["不可", "初級", "中級", "上級"],
  応募書類状況フラグ: ["未着手", "作成途中", "作成済"],
  応募書類サポートフラグ: ["マイナビ転職から作成", "Googleフォームから作成", "本人作成書類から作成", "ヤギッシュ等作成を依頼"],
  LINE設定フラグ: ["LINE", "LINE無_当社判断", "メール"],
  求人送付フラグ: ["求人送付予定", "求人送付無し"],
  退職理由_大: ["過去型", "未来型"],
  退職理由_中: ["会社都合", "個人都合", "環境要因", "キャリア志向", "働き方の見直し", "将来設計"],
  退職理由_小: [
    "業績不振・倒産", "会社の方針変更による配置転換", "契約満了（期間満了）", "部署・拠点の閉鎖", "希望しない異動",
    "長時間労働・過重労働", "残業や休日出勤が多い", "ハラスメント（パワハラ・セクハラ等）", "上司・同僚との人間関係",
    "評価制度への不満", "昇給・昇進がない", "給与・待遇が見合わない", "仕事内容が合わない・ギャップがある",
    "成長・スキルアップの機会が少ない", "やりがいを感じない", "健康上の理由",
    "通勤時間が長い・転居により通勤困難", "家庭の事情（育児・介護）", "結婚・出産", "ワークライフバランスが取れない",
    "職場の雰囲気が合わない", "社風・価値観の違い", "配偶者の転勤による引っ越しのため",
    "やりたい仕事に挑戦したい", "新しい業界・職種にチャレンジしたい", "専門性を深めたい（資格取得・技術習得など）",
    "マネジメントに挑戦したい", "自分の裁量を広げたい", "より成長できる環境を求めて",
    "リモート勤務・フレックスなど柔軟な働き方を求めて", "地元で働きたい／Uターン・Iターン希望",
    "ワークライフバランスを重視したい", "働く環境や風土にこだわりたい（例：フラットな組織文化）", "都市部で働きたい",
    "将来の夢・ビジョンを実現するため", "海外でのキャリアを積みたい", "起業・独立準備のため", "家業を継ぐため", "正社員になりたい"
  ],
  エリア: ["北海道", "東北", "北関東", "首都圏", "甲信越", "北陸", "東海", "関西", "中国", "四国", "九州"],
  都道府県: [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
    "岐阜県", "静岡県", "愛知県", "三重県",
    "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
    "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県",
    "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
  ],
} as const;

export const TENSE_ENUM = ["未来", "過去", "混在", "不明"] as const;

/**
 * Gemini API の responseSchema として使用する JSON Schema を生成
 * Chain of Thought を強制するため、thought_process を最初に出力させる
 */
export function buildCommonAnalysisResponseSchema() {
  return {
    type: "object",
    properties: {
      thought_process: {
        type: "object",
        description: "分析の思考プロセス。フラグを選ぶ前に必ず言語化すること",
        properties: {
          pdf_evidence: {
            type: "string",
            description: "PDFから読み取った客観的事実（職歴・学歴・スキル等）"
          },
          interview_evidence: {
            type: "string",
            description: "面談ログから読み取った本音・意向・感情"
          },
          contradiction_analysis: {
            type: "string",
            description: "PDFの建前と面談の本音の矛盾点・ギャップの分析"
          },
          resignation_reasoning: {
            type: "string",
            description: "退職理由の推論過程。どの発話からどのカテゴリを選んだか"
          },
          tense_reasoning: {
            type: "string",
            description: "時制（過去型/未来型）の判定根拠"
          },
          flag_fitting_notes: {
            type: "string",
            description: "フラグリストへのフィッティング時の判断メモ"
          }
        }
      },
      extracted_facts: {
        type: "object",
        description: "抽出された事実情報",
        properties: {
          candidate_no: { type: "string", description: "5で始まる7桁の求職者番号" },
          candidate_name: { type: "string", description: "求職者氏名" },
          work_history: {
            type: "array",
            description: "職歴の配列。在籍順に並べる",
            items: {
              type: "object",
              properties: {
                企業名: { type: "string" },
                事業内容: { type: "string" },
                在籍期間_年: { type: "integer", description: "在籍年数" },
                在籍期間_ヶ月: { type: "integer", description: "在籍月数（12未満）" },
                職種フラグ: { type: "string" },
                職種メモ: { type: "string" },
                退職理由_大: { type: "string", enum: [...FLAG_ENUMS.退職理由_大] },
                退職理由_中: { type: "string", enum: [...FLAG_ENUMS.退職理由_中] },
                退職理由_小: { type: "string", enum: [...FLAG_ENUMS.退職理由_小] },
                転職理由メモ: { type: "string" }
              }
            }
          },
          tense: { type: "string", enum: [...TENSE_ENUM], description: "面談の時制" },
          reading_targets: {
            type: "array",
            items: { type: "string" },
            description: "読むべき内容・確認すべき論点"
          }
        }
      },
      filemaker_mapping: {
        type: "object",
        description: "FileMakerインポート用のマッピング",
        properties: {
          エージェント利用フラグ: { type: "string", enum: [...FLAG_ENUMS.エージェント利用フラグ] },
          エージェント利用メモ: { type: "string" },
          転職時期フラグ: { type: "string", enum: [...FLAG_ENUMS.転職時期フラグ] },
          転職時期メモ: { type: "string" },
          転職活動期間フラグ: { type: "string", enum: [...FLAG_ENUMS.転職活動期間フラグ] },
          転職活動期間メモ: { type: "string" },
          現在応募求人数: { type: "integer" },
          応募種別フラグ: { type: "string", enum: [...FLAG_ENUMS.応募種別フラグ] },
          応募状況メモ: { type: "string" },
          学歴フラグ: { type: "string", enum: [...FLAG_ENUMS.学歴フラグ] },
          学歴メモ: { type: "string" },
          卒業年月: { type: "string", description: "YYYY年M月 卒業 形式" },
          面談メモ: { type: "string" },
          希望職種フラグ: { type: "string" },
          希望職種メモ: { type: "string" },
          希望業種フラグ: { type: "string" },
          希望業種メモ: { type: "string" },
          希望エリアフラグ: { type: "string", enum: [...FLAG_ENUMS.エリア] },
          希望_都道府県: { type: "string", enum: [...FLAG_ENUMS.都道府県] },
          希望_市区: { type: "string" },
          希望エリアメモ: { type: "string" },
          現在年収: { type: "integer", description: "万円単位" },
          希望下限年収: { type: "integer", description: "万円単位" },
          希望年収: { type: "integer", description: "万円単位" },
          現年収メモ: { type: "string" },
          下限年収メモ: { type: "string" },
          希望年収メモ: { type: "string" },
          希望曜日フラグ: { type: "string", enum: [...FLAG_ENUMS.希望曜日フラグ] },
          希望曜日メモ: { type: "string" },
          希望最大残業フラグ: { type: "string", enum: [...FLAG_ENUMS.希望最大残業フラグ] },
          希望最大残業メモ: { type: "string" },
          希望転勤フラグ: { type: "string", enum: [...FLAG_ENUMS.希望転勤フラグ] },
          希望転勤メモ: { type: "string" },
          自動車免許フラグ: { type: "string", enum: [...FLAG_ENUMS.自動車免許フラグ] },
          自動車免許メモ: { type: "string" },
          語学フラグ: { type: "string", enum: [...FLAG_ENUMS.語学フラグ] },
          語学スキルフラグ: { type: "string", enum: [...FLAG_ENUMS.語学スキルフラグ] },
          語学スキルメモ: { type: "string" },
          日本語スキルフラグ: { type: "string", enum: [...FLAG_ENUMS.日本語スキルフラグ] },
          日本語スキルメモ: { type: "string" },
          PCスキル_タイピングフラグ: { type: "string", enum: [...FLAG_ENUMS.PCスキル_タイピングフラグ] },
          PCスキル_タイピングメモ: { type: "string" },
          PCスキル_Excelフラグ: { type: "string", enum: [...FLAG_ENUMS.PCスキル_Excelフラグ] },
          PCスキル_Excelメモ: { type: "string" },
          PCスキル_Wordフラグ: { type: "string", enum: [...FLAG_ENUMS.PCスキル_Wordフラグ] },
          PCスキル_Wordメモ: { type: "string" },
          PCスキル_PPTフラグ: { type: "string", enum: [...FLAG_ENUMS.PCスキル_PPTフラグ] },
          PCスキル_PPTメモ: { type: "string" },
          応募書類状況フラグ: { type: "string", enum: [...FLAG_ENUMS.応募書類状況フラグ] },
          応募書類状況メモ: { type: "string" },
          応募書類サポートフラグ: { type: "string", enum: [...FLAG_ENUMS.応募書類サポートフラグ] },
          応募書類サポートメモ: { type: "string" },
          LINE設定フラグ: { type: "string", enum: [...FLAG_ENUMS.LINE設定フラグ] },
          LINE設定メモ: { type: "string" },
          求人送付フラグ: { type: "string", enum: [...FLAG_ENUMS.求人送付フラグ] },
          求人送付予定時期: { type: "string" },
          求人送付メモ: { type: "string" },
          次回面談設定フラグ: { type: "string" },
          次回面談予定日: { type: "string", description: "YYYY/MM/DD形式" },
          次回面談予定時刻: { type: "string", description: "HH:MM形式" },
          次回面談予定メモ: { type: "string" },
          フリーメモ: { type: "string" },
          初回面談まとめ: { type: "string", description: "面談内容の要約。求職者NO等のキー情報は含めない" },
          インポート用照合キー: { type: "integer", description: "求職者NO+1の8桁数値" }
        }
      },
      missing_items: {
        type: "array",
        items: { type: "string" },
        description: "3つの資料のいずれにも記載がなかった項目"
      }
    }
  };
}

/**
 * 最小限のResponse Schema（疎通確認用）
 */
export function buildMinimalResponseSchema() {
  return {
    type: "object",
    properties: {
      extracted_facts: {
        type: "object",
        properties: {
          candidate_no: { type: "string" },
          candidate_name: { type: "string" },
          tense: { type: "string", enum: [...TENSE_ENUM] }
        }
      },
      filemaker_mapping: {
        type: "object",
        properties: {
          学歴フラグ: { type: "string", enum: [...FLAG_ENUMS.学歴フラグ] },
          初回面談まとめ: { type: "string" }
        }
      },
      missing_items: {
        type: "array",
        items: { type: "string" }
      }
    }
  };
}
