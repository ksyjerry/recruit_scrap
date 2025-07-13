"use client";

import { useState, useEffect, useRef } from "react";
import {
  BriefcaseIcon,
  PlayIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import * as XLSX from "xlsx";

// 타입 정의
interface JobData {
  "Job Title"?: string;
  "Company Name"?: string;
  Location?: string;
  "Career Level"?: string;
  "Education Requirement"?: string;
  "Application Deadline"?: string;
  "Date Posted"?: string;
  "Job Sector"?: string;
  "Job Position"?: string;
  "Job Details Link"?: string;
  "Company Info Link"?: string;
  "Job Type"?: string;
  "Employment Type"?: string;
  [key: string]: string | undefined;
}

interface ApiResponseData {
  result?: {
    status?: string;
    id?: string;
    startedAt?: string;
    finishedAt?: string;
    capturedLists?: {
      [key: string]: JobData[];
    };
  };
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<"scrape" | "data" | null>(
    null
  );
  const [taskId, setTaskId] = useState<string | null>(null);
  const [scrapedData, setScrapedData] = useState<JobData[]>([]);
  const [debugData, setDebugData] = useState<ApiResponseData | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 스크래핑 설정 상태
  const [originUrl, setOriginUrl] = useState(
    "https://www.saramin.co.kr/zf_user/jobs/list/job-category?cat_kewd=322%2C323%2C2198&panel_type=&search_optional_item=n&search_done=y&panel_count=y&preview=y"
  );
  const [jobListingsLimit, setJobListingsLimit] = useState(10);
  const [keywordsInput, setKeywordsInput] = useState(
    "인사, 회계, 경리, 경영지원, 세무, 재무"
  );

  // 키워드가 변경될 때마다 기존 데이터를 다시 정렬
  useEffect(() => {
    if (scrapedData.length > 0) {
      const resortedData = sortJobDataByKeywordsAndDate([...scrapedData]);
      setScrapedData(resortedData);
      console.log(
        `🔄 키워드 변경으로 데이터 재정렬 완료: ${parseKeywords(
          keywordsInput
        ).join(", ")}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywordsInput]);

  // 등록일 문자열을 날짜로 변환하는 함수
  const parsePostedDate = (postedText: string): Date => {
    const now = new Date();

    if (!postedText || postedText === "-") {
      return new Date(0); // 기본값으로 가장 오래된 날짜
    }

    // "N일 전 등록", "N주 전 등록", "N개월 전 등록" 형태 파싱
    const match = postedText.match(/(\d+)(일|주|개월|년)\s*전/);
    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2];

      const date = new Date(now);

      switch (unit) {
        case "일":
          date.setDate(date.getDate() - amount);
          break;
        case "주":
          date.setDate(date.getDate() - amount * 7);
          break;
        case "개월":
          date.setMonth(date.getMonth() - amount);
          break;
        case "년":
          date.setFullYear(date.getFullYear() - amount);
          break;
      }

      return date;
    }

    // "오늘 등록" 형태
    if (postedText.includes("오늘")) {
      return now;
    }

    // "어제 등록" 형태
    if (postedText.includes("어제")) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }

    // 파싱할 수 없는 경우 기본값
    return new Date(0);
  };

  // 채용 유형 필드를 찾는 함수
  const getJobType = (job: JobData): string => {
    // 가능한 채용 유형 필드명들
    const possibleFields = [
      "Job Type",
      "Employment Type",
      "고용형태",
      "채용형태",
      "근무형태",
      "Job Category",
      "직무유형",
      "Career Level",
      "Position Type",
    ];

    for (const field of possibleFields) {
      if (job[field] && job[field] !== "-") {
        return job[field];
      }
    }

    return "-";
  };

  // 입력된 키워드 문자열을 배열로 파싱
  const parseKeywords = (keywordsStr: string): string[] => {
    return keywordsStr
      .split(",")
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0);
  };

  // 채용 제목에서 키워드 매칭 여부 확인
  const matchesKeywords = (jobTitle: string): boolean => {
    const keywords = parseKeywords(keywordsInput);
    return keywords.some((keyword) => jobTitle.includes(keyword));
  };

  // 채용 데이터를 키워드 매칭 및 등록일 기준으로 정렬하는 함수
  const sortJobDataByKeywordsAndDate = (jobData: JobData[]) => {
    // 키워드 매칭 여부에 따라 분류
    const matchedJobs = jobData.filter((job: JobData) =>
      matchesKeywords(job["Job Title"] || "")
    );
    const unmatchedJobs = jobData.filter(
      (job: JobData) => !matchesKeywords(job["Job Title"] || "")
    );

    // 각 그룹을 등록일 기준으로 정렬
    const sortByDate = (jobs: JobData[]) => {
      return jobs.sort((a, b) => {
        const dateA = parsePostedDate(a["Date Posted"] || "");
        const dateB = parsePostedDate(b["Date Posted"] || "");
        return dateB.getTime() - dateA.getTime();
      });
    };

    const sortedMatchedJobs = sortByDate(matchedJobs);
    const sortedUnmatchedJobs = sortByDate(unmatchedJobs);

    console.log(
      `🎯 키워드 매칭 결과: ${sortedMatchedJobs.length}개 매칭, ${sortedUnmatchedJobs.length}개 기타`
    );

    // 매칭된 것들을 위에, 매칭되지 않은 것들을 아래에 배치
    return [...sortedMatchedJobs, ...sortedUnmatchedJobs];
  };

  // 데이터 상태 확인 함수
  const checkDataStatus = async (currentTaskId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/task/${currentTaskId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (response.ok && result.data.result) {
        setDebugData(result.data); // 작업 상태 표시용 데이터 저장

        if (result.data.result.capturedLists) {
          const capturedLists = result.data.result.capturedLists;

          // 실제 데이터 구조에 맞는 키들을 확인
          let jobData = [];
          const possibleKeys = [
            "Job Listings",
            "job_listings",
            "Job listings",
            "jobs",
            "list",
            "data",
            "items",
            "results",
          ];

          for (const key of possibleKeys) {
            if (capturedLists[key] && Array.isArray(capturedLists[key])) {
              jobData = capturedLists[key];
              break;
            }
          }

          // 키를 찾지 못했다면 첫 번째 배열 값 사용
          if (jobData.length === 0) {
            const firstArrayValue = Object.values(capturedLists).find((value) =>
              Array.isArray(value)
            );
            if (firstArrayValue) {
              jobData = firstArrayValue;
            }
          }

          if (jobData.length > 0) {
            console.log(`✅ 데이터 준비 완료! 항목 수: ${jobData.length}개`);
            return true;
          }
        }
      }
      return false;
    } catch (err) {
      console.error("데이터 상태 확인 중 오류:", err);
      return false;
    }
  };

  // 폴링 시작
  const startPolling = (currentTaskId: string) => {
    setIsPolling(true);
    setDataReady(false);

    let pollingCount = 0;

    pollingIntervalRef.current = setInterval(async () => {
      pollingCount += 1;
      console.log(`📡 데이터 확인 중... (${pollingCount}회차)`);

      // 30회차 제한 체크
      if (pollingCount >= 30) {
        stopPolling();
        alert(
          "스크래핑이 완료되지 않았습니다.\n30회 확인 후에도 데이터가 준비되지 않아 중단합니다.\n\n다시 스크래핑을 실행해주세요."
        );
        console.log("❌ 30회차 도달로 폴링 중단");
        return;
      }

      const hasData = await checkDataStatus(currentTaskId);

      if (hasData) {
        setDataReady(true);
        stopPolling();
        console.log(
          "🎉 데이터가 준비되었습니다! 이제 '스크래핑 데이터 가져오기' 버튼을 클릭하세요."
        );
      }
    }, 10000); // 10초마다 실행
  };

  // 폴링 중지
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  };

  // 컴포넌트 언마운트 시 폴링 정리
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const handleScrape = async () => {
    // 유효성 검사
    if (!originUrl.trim()) {
      alert("스크래핑 URL을 입력해주세요!");
      return;
    }

    try {
      new URL(originUrl);
    } catch {
      alert("유효하지 않은 URL입니다. 올바른 URL을 입력해주세요!");
      return;
    }

    if (jobListingsLimit < 1 || jobListingsLimit > 100) {
      alert("데이터 수는 1-100 사이의 값이어야 합니다!");
      return;
    }

    setIsLoading(true);
    setLoadingType("scrape");

    // 이전 폴링 중지 및 상태 초기화
    stopPolling();
    setDataReady(false);
    setScrapedData([]);
    setDebugData(null);

    try {
      console.log("스크래핑 시작...");
      console.log("URL:", originUrl);
      console.log("데이터 수:", jobListingsLimit);

      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originUrl,
          job_listings_limit: jobListingsLimit,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        console.log("스크래핑 완료!", result);

        // Task ID 특별히 강조해서 출력
        if (result.taskId) {
          console.log("🎯 생성된 Task ID:", result.taskId);
          setTaskId(result.taskId); // Task ID 상태에 저장

          // 스크래핑 성공 후 자동으로 데이터 확인 시작
          console.log("📡 10초마다 데이터 확인을 시작합니다...");
          startPolling(result.taskId);

          alert(
            `스크래핑이 성공적으로 시작되었습니다!\n\n생성된 Task ID: ${result.taskId}\n\n10초마다 자동으로 데이터를 확인합니다.\n데이터가 준비되면 '스크래핑 데이터 가져오기' 버튼이 활성화됩니다.`
          );
        } else {
          alert("스크래핑이 성공적으로 완료되었습니다!");
        }
      } else {
        console.error("스크래핑 실패:", result.error);
        alert(`스크래핑 실패: ${result.error}`);
      }
    } catch (error) {
      console.error("스크래핑 중 오류 발생:", error);
      alert("스크래핑 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  };

  const handleGetData = async () => {
    if (!taskId) {
      alert("먼저 스크래핑을 실행하여 Task ID를 생성해주세요!");
      return;
    }

    setIsLoading(true);
    setLoadingType("data");

    // 폴링 중지
    stopPolling();

    try {
      console.log("데이터 가져오는 중...", taskId);

      const response = await fetch(`/api/task/${taskId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (response.ok) {
        console.log("데이터 가져오기 완료!", result);

        // 스크래핑 결과 데이터 추출 및 저장
        if (result.data.result && result.data.result.capturedLists) {
          const capturedLists = result.data.result.capturedLists;

          // 실제 데이터 구조에 맞는 키들을 확인
          let jobData = [];

          // Browse.ai에서 사용하는 실제 키들을 확인
          const possibleKeys = [
            "Job Listings",
            "job_listings",
            "Job listings",
            "jobs",
            "list",
            "data",
            "items",
            "results",
          ];

          for (const key of possibleKeys) {
            if (capturedLists[key] && Array.isArray(capturedLists[key])) {
              jobData = capturedLists[key];
              console.log(
                `✅ 데이터를 ${key} 키에서 찾았습니다. 항목 수: ${jobData.length}개`
              );
              break;
            }
          }

          // 키를 찾지 못했다면 첫 번째 배열 값 사용
          if (jobData.length === 0) {
            const firstArrayValue = Object.values(capturedLists).find((value) =>
              Array.isArray(value)
            );
            if (firstArrayValue) {
              jobData = firstArrayValue;
              console.log(
                "✅ 첫 번째 배열 값을 사용합니다. 항목 수:",
                jobData.length
              );
            }
          }

          // 실제 데이터 구조 확인을 위한 디버깅 로그
          if (jobData.length > 0) {
            console.log("🔍 첫 번째 채용 데이터의 모든 필드:");
            console.log(JSON.stringify(jobData[0], null, 2));
            console.log("📋 사용 가능한 모든 필드명:");
            console.log(Object.keys(jobData[0]));
            console.log("💼 채용 유형 매핑 결과:");
            console.log(`매핑된 채용 유형: "${getJobType(jobData[0])}"`);

            // 채용 유형 관련 필드들 확인
            const jobTypeFields = [
              "Job Type",
              "Employment Type",
              "고용형태",
              "채용형태",
              "근무형태",
              "Job Category",
              "직무유형",
              "Career Level",
              "Position Type",
            ];
            jobTypeFields.forEach((field) => {
              if (jobData[0][field]) {
                console.log(`  - ${field}: "${jobData[0][field]}"`);
              }
            });
          }

          // 키워드 매칭 및 등록일 기준으로 정렬하여 데이터 설정
          const sortedJobData = sortJobDataByKeywordsAndDate([...jobData]);
          console.log(
            "📅 등록일 기준으로 정렬 완료:",
            sortedJobData.slice(0, 3).map((job) => ({
              title: job["Job Title"],
              datePosted: job["Date Posted"],
              parsedDate: parsePostedDate(
                job["Date Posted"] || ""
              ).toISOString(),
            }))
          );
          setScrapedData(sortedJobData);
          setDebugData(result.data); // 작업 상태 표시용 데이터 저장

          // 데이터를 성공적으로 가져온 후 상태 초기화
          setDataReady(false);

          alert(
            `데이터 가져오기 완료!\n\n작업 상태: ${result.data.result.status}\n채용정보 수: ${jobData.length}개\nTask ID: ${result.taskId}`
          );
        } else if (result.data.result && result.data.result.status) {
          setDebugData(result.data); // 작업 상태 표시용 데이터 저장
          const status = result.data.result.status;

          if (status === "running" || status === "pending") {
            // 아직 진행 중이면 다시 폴링 시작
            setDataReady(false);
            startPolling(taskId);
            alert(
              `스크래핑 작업이 아직 진행 중입니다.\n\n작업 상태: ${status}\n자동으로 다시 확인을 시작합니다.\nTask ID: ${result.taskId}`
            );
          } else if (status === "failed") {
            setDataReady(false);
            alert(
              `스크래핑 작업이 실패했습니다.\n\n작업 상태: ${status}\nTask ID: ${result.taskId}`
            );
          } else {
            setDataReady(false);
            alert(
              `데이터 가져오기 완료!\n\n작업 상태: ${status}\nTask ID: ${result.taskId}`
            );
          }
        } else {
          setDebugData(result.data); // 작업 상태 표시용 데이터 저장
          setDataReady(false);
          alert("데이터 가져오기 완료!");
        }
      } else {
        console.error("데이터 가져오기 실패:", result.error);
        alert(`데이터 가져오기 실패: ${result.error}`);
      }
    } catch (error) {
      console.error("데이터 가져오기 중 오류 발생:", error);
      alert("데이터 가져오기 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  };

  const handleExcelDownload = () => {
    if (scrapedData.length === 0) {
      alert("다운로드할 데이터가 없습니다. 먼저 스크래핑을 실행해주세요!");
      return;
    }

    // 엑셀에 들어갈 데이터 변환
    const excelData = scrapedData.map((job, index) => ({
      순번: index + 1,
      "채용 제목": job["Job Title"] || "-",
      회사명: job["Company Name"] || "-",
      지역: job.Location || "-",
      "경력 수준": job["Career Level"] || "-",
      "학력 요구사항": job["Education Requirement"] || "-",
      "채용 유형": getJobType(job),
      "지원 마감일": job["Application Deadline"] || "-",
      등록일: job["Date Posted"] || "-",
      "직무 분야": job["Job Sector"] || "-",
      "직무 포지션": job["Job Position"] || "-",
      "채용 상세 링크": job["Job Details Link"] || "-",
      "회사 정보 링크": job["Company Info Link"] || "-",
    }));

    // 워크북 생성
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // 하이퍼링크 추가
    scrapedData.forEach((job, index) => {
      const rowIndex = index + 2; // 헤더가 1행이므로 데이터는 2행부터 시작

      // 채용 상세 링크 하이퍼링크 추가 (L열)
      if (job["Job Details Link"] && job["Job Details Link"] !== "-") {
        const linkCell = `L${rowIndex}`;
        if (worksheet[linkCell]) {
          worksheet[linkCell].l = { Target: job["Job Details Link"] };
          worksheet[linkCell].s = {
            font: { color: { rgb: "0563C1" }, underline: true },
          };
        }
      }

      // 회사 정보 링크 하이퍼링크 추가 (M열)
      if (job["Company Info Link"] && job["Company Info Link"] !== "-") {
        const linkCell = `M${rowIndex}`;
        if (worksheet[linkCell]) {
          worksheet[linkCell].l = { Target: job["Company Info Link"] };
          worksheet[linkCell].s = {
            font: { color: { rgb: "0563C1" }, underline: true },
          };
        }
      }
    });

    // 컬럼 너비 설정
    const columnWidths = [
      { wch: 6 }, // 순번
      { wch: 40 }, // 채용 제목
      { wch: 20 }, // 회사명
      { wch: 15 }, // 지역
      { wch: 15 }, // 경력 수준
      { wch: 15 }, // 학력 요구사항
      { wch: 15 }, // 채용 유형
      { wch: 12 }, // 지원 마감일
      { wch: 12 }, // 등록일
      { wch: 12 }, // 직무 분야
      { wch: 15 }, // 직무 포지션
      { wch: 50 }, // 채용 상세 링크
      { wch: 50 }, // 회사 정보 링크
    ];
    worksheet["!cols"] = columnWidths;

    // 워크시트를 워크북에 추가
    XLSX.utils.book_append_sheet(workbook, worksheet, "채용정보");

    // 파일명 생성 (현재 날짜와 시간 포함)
    const now = new Date();
    const dateString =
      now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      "_" +
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0");
    const fileName = `사람인_채용정보_${dateString}.xlsx`;

    // 파일 다운로드
    XLSX.writeFile(workbook, fileName);

    // 성공 메시지 표시
    setDownloadMessage(`엑셀 파일이 다운로드되었습니다: ${fileName}`);
    console.log(`엑셀 파일이 다운로드되었습니다: ${fileName}`);

    // 3초 후 메시지 숨기기
    setTimeout(() => {
      setDownloadMessage(null);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="text-center mb-12">
          <div className="flex justify-center items-center mb-6">
            <div className="bg-blue-100 p-4 rounded-full">
              <BriefcaseIcon className="w-12 h-12 text-blue-600" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            채용정보 스크래퍼
          </h1>
          <p className="text-gray-600">간단하고 빠른 채용정보 수집</p>
        </div>

        {/* 메인 컨트롤 영역 - 좌우 배치 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* 왼쪽: 스크래핑 설정 */}
          <div className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center mb-4">
              <div className="bg-blue-100 p-2 rounded-lg mr-3">
                <svg
                  className="w-5 h-5 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800">
                스크래핑 설정
              </h3>
            </div>

            {/* URL 입력 */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-800 mb-2">
                📍 스크래핑 URL
              </label>
              <input
                type="url"
                value={originUrl}
                onChange={(e) => setOriginUrl(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all duration-200 text-gray-800"
                placeholder="사람인 채용정보 페이지 URL을 입력하세요"
                disabled={isLoading || isPolling}
              />
              <p className="text-xs text-gray-800 mt-1">
                사람인 채용 페이지의 URL을 입력하세요
              </p>
            </div>

            {/* 데이터 수 입력 */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-800 mb-2">
                📊 스크래핑 데이터 수
              </label>
              <div className="flex items-center space-x-3">
                <input
                  type="number"
                  value={jobListingsLimit}
                  onChange={(e) =>
                    setJobListingsLimit(
                      Math.max(1, Math.min(100, parseInt(e.target.value) || 1))
                    )
                  }
                  min="1"
                  max="100"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all duration-200 text-gray-800"
                  placeholder="가져올 채용정보 수"
                  disabled={isLoading || isPolling}
                />
                <div className="text-sm text-gray-800 whitespace-nowrap">
                  개 (1-100)
                </div>
              </div>
              <p className="text-xs text-gray-800 mt-2">
                ⚡ 권장: 10-50개 (더 많은 데이터일수록 스크래핑 시간이
                길어집니다)
              </p>
            </div>

            {/* 키워드 입력 */}
            <div className="mb-2">
              <label className="block text-sm font-medium text-gray-800 mb-2">
                🎯 우선순위 키워드
              </label>
              <input
                type="text"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all duration-200 text-gray-800"
                placeholder="우선순위로 표시할 키워드를 콤마로 구분해서 입력하세요"
                disabled={isLoading || isPolling}
              />
              <p className="text-xs text-gray-800 mt-2">
                💡 이 키워드가 포함된 채용공고가 상단에 표시되고, 나머지는
                하단에 연한 색상으로 표시됩니다
              </p>
            </div>
          </div>

          {/* 오른쪽: 버튼들과 작업 상태 */}
          <div className="space-y-6">
            {/* Task ID 표시 */}
            {taskId && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-green-800 font-medium">
                    Task ID 준비됨
                  </span>
                </div>
                <p className="text-green-700 text-sm mt-1 font-mono break-all">
                  {taskId}
                </p>
              </div>
            )}

            {/* 메인 액션 버튼들 */}
            <div className="space-y-4">
              {/* 스크래핑 실행 버튼 */}
              <button
                onClick={handleScrape}
                disabled={isLoading}
                className={`w-full bg-white border-2 border-blue-500 text-blue-600 py-4 px-6 rounded-xl font-medium text-lg transition-all duration-200 hover:bg-blue-50 hover:shadow-lg ${
                  isLoading && loadingType === "scrape"
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:-translate-y-1"
                }`}
              >
                <div className="flex items-center justify-center">
                  {isLoading && loadingType === "scrape" ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
                  ) : (
                    <PlayIcon className="w-5 h-5 mr-3" />
                  )}
                  {isLoading && loadingType === "scrape"
                    ? "스크래핑 중..."
                    : "스크래핑 실행하기"}
                </div>
              </button>

              {/* 데이터 가져오기 버튼 */}
              <button
                onClick={handleGetData}
                disabled={isLoading || !taskId || (!dataReady && !isPolling)}
                className={`w-full py-4 px-6 rounded-xl font-medium text-lg transition-all duration-200 ${
                  !taskId
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : isLoading && loadingType === "data"
                    ? "bg-blue-600 text-white opacity-50 cursor-not-allowed"
                    : !dataReady && !isPolling
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : dataReady
                    ? "bg-green-600 text-white hover:bg-green-700 hover:shadow-lg hover:-translate-y-1"
                    : "bg-yellow-500 text-white cursor-not-allowed"
                }`}
              >
                <div className="flex items-center justify-center">
                  {isLoading && loadingType === "data" ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                  ) : isPolling ? (
                    <div className="animate-pulse w-2 h-2 bg-white rounded-full mr-3"></div>
                  ) : dataReady ? (
                    <DocumentTextIcon className="w-5 h-5 mr-3" />
                  ) : (
                    <DocumentTextIcon className="w-5 h-5 mr-3" />
                  )}
                  {isLoading && loadingType === "data"
                    ? "데이터 가져오는 중..."
                    : !taskId
                    ? "스크래핑 먼저 실행하세요"
                    : isPolling
                    ? "데이터 확인 중..."
                    : dataReady
                    ? "스크래핑 데이터 가져오기 ✅"
                    : "데이터 준비 중..."}
                </div>
              </button>
            </div>

            {/* 상태 메시지 */}
            {isLoading && (
              <div className="text-center">
                <div className="inline-flex items-center px-4 py-2 rounded-full text-sm bg-blue-100 text-blue-700">
                  <div className="animate-pulse w-2 h-2 bg-current rounded-full mr-2"></div>
                  {loadingType === "scrape"
                    ? "채용정보를 수집하고 있습니다..."
                    : loadingType === "data"
                    ? "저장된 데이터를 불러오고 있습니다..."
                    : "처리 중..."}
                </div>
              </div>
            )}

            {/* 데이터 준비 완료 메시지 */}
            {dataReady && !isLoading && (
              <div className="text-center">
                <div className="inline-flex items-center px-4 py-2 bg-green-100 rounded-full text-green-700 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  데이터가 준비되었습니다! 이제 가져오기 버튼을 클릭하세요.
                </div>
              </div>
            )}

            {/* 작업 상태 표시 */}
            {debugData && debugData.result && (
              <div className="bg-white rounded-2xl shadow-xl p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">
                  📊 작업 상태
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm text-blue-600 font-medium">
                      작업 상태
                    </p>
                    <p className="text-lg font-bold text-blue-800">
                      {debugData.result.status || "알 수 없음"}
                    </p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-sm text-green-600 font-medium">
                      작업 ID
                    </p>
                    <p className="text-lg font-bold text-green-800 font-mono">
                      {debugData.result.id || "알 수 없음"}
                    </p>
                  </div>
                  {debugData.result.startedAt && (
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-sm text-purple-600 font-medium">
                        시작 시간
                      </p>
                      <p className="text-lg font-bold text-purple-800">
                        {new Date(debugData.result.startedAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {debugData.result.finishedAt && (
                    <div className="bg-orange-50 rounded-lg p-4">
                      <p className="text-sm text-orange-600 font-medium">
                        완료 시간
                      </p>
                      <p className="text-lg font-bold text-orange-800">
                        {new Date(debugData.result.finishedAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 다운로드 성공 메시지 */}
        {downloadMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg mb-6 flex items-center">
            <ArrowDownTrayIcon className="w-5 h-5 mr-2" />
            <span>{downloadMessage}</span>
          </div>
        )}

        {/* 스크래핑 데이터 표 */}
        {scrapedData.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">
                  스크래핑 결과 ({scrapedData.length}개)
                </h2>
                <div className="text-sm text-gray-500 mt-1">
                  Task ID: {taskId}
                </div>
                <div className="flex items-center mt-2 text-sm">
                  <span className="text-blue-600 font-medium">
                    🎯 키워드 매칭:{" "}
                    {
                      scrapedData.filter((job) =>
                        matchesKeywords(job["Job Title"] || "")
                      ).length
                    }
                    개
                  </span>
                  <span className="mx-2 text-gray-400">|</span>
                  <span className="text-gray-500">
                    기타:{" "}
                    {
                      scrapedData.filter(
                        (job) => !matchesKeywords(job["Job Title"] || "")
                      ).length
                    }
                    개
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  키워드: {keywordsInput || "없음"}
                </div>
              </div>
              <button
                onClick={handleExcelDownload}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 font-medium"
              >
                <ArrowDownTrayIcon className="w-5 h-5 mr-2" />
                엑셀 다운로드
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700">
                      순번
                    </th>
                    <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700">
                      채용 제목
                    </th>
                    <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700">
                      회사명
                    </th>
                    <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700">
                      지역
                    </th>
                    <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700">
                      경력 수준
                    </th>
                    <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700">
                      학력 요구사항
                    </th>
                    <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700">
                      채용 유형
                    </th>
                    <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700">
                      지원 마감일
                    </th>
                    <th className="border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700">
                      등록일
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scrapedData.map((job, index) => {
                    const isMatched = matchesKeywords(job["Job Title"] || "");
                    const rowClassName = isMatched
                      ? "hover:bg-gray-50"
                      : "bg-gray-50 hover:bg-gray-100 opacity-60";
                    const textClassName = isMatched
                      ? "text-gray-700"
                      : "text-gray-500";

                    return (
                      <tr key={index} className={rowClassName}>
                        <td
                          className={`border border-gray-200 px-4 py-3 text-sm ${textClassName}`}
                        >
                          {index + 1}
                        </td>
                        <td
                          className={`border border-gray-200 px-4 py-3 text-sm ${textClassName}`}
                        >
                          <a
                            href={job["Job Details Link"]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={
                              isMatched
                                ? "text-blue-600 hover:text-blue-800 hover:underline"
                                : "text-blue-400 hover:text-blue-600 hover:underline"
                            }
                          >
                            {job["Job Title"] || "-"}
                          </a>
                        </td>
                        <td
                          className={`border border-gray-200 px-4 py-3 text-sm ${textClassName}`}
                        >
                          <a
                            href={job["Company Info Link"]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={
                              isMatched
                                ? "text-blue-600 hover:text-blue-800 hover:underline"
                                : "text-blue-400 hover:text-blue-600 hover:underline"
                            }
                          >
                            {job["Company Name"] || "-"}
                          </a>
                        </td>
                        <td
                          className={`border border-gray-200 px-4 py-3 text-sm ${textClassName}`}
                        >
                          {job.Location || "-"}
                        </td>
                        <td
                          className={`border border-gray-200 px-4 py-3 text-sm ${textClassName}`}
                        >
                          {job["Career Level"] || "-"}
                        </td>
                        <td
                          className={`border border-gray-200 px-4 py-3 text-sm ${textClassName}`}
                        >
                          {job["Education Requirement"] || "-"}
                        </td>
                        <td
                          className={`border border-gray-200 px-4 py-3 text-sm ${textClassName}`}
                        >
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              isMatched
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {getJobType(job)}
                          </span>
                        </td>
                        <td
                          className={`border border-gray-200 px-4 py-3 text-sm ${textClassName}`}
                        >
                          <span
                            className={`font-medium ${
                              isMatched ? "text-red-600" : "text-red-400"
                            }`}
                          >
                            {job["Application Deadline"] || "-"}
                          </span>
                        </td>
                        <td
                          className={`border border-gray-200 px-4 py-3 text-sm text-gray-500`}
                        >
                          {job["Date Posted"] || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
