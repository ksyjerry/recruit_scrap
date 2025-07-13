import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.BROWSE_API_KEY;
    const robotId = process.env.ROBOT_ID;

    if (!apiKey || !robotId) {
      return NextResponse.json(
        { error: "API 키 또는 로봇 ID가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    // 요청 본문에서 URL과 limit 받아오기
    const body = await request.json();
    const { 
      originUrl = "https://www.saramin.co.kr/zf_user/jobs/list/job-category?cat_kewd=322&tab_type=dispatch&panel_type=&search_optional_item=n&search_done=y&panel_count=y&smart_tag=", 
      job_listings_limit = 10 
    } = body;

    // URL 유효성 검사
    try {
      new URL(originUrl);
    } catch (error) {
      return NextResponse.json(
        { error: "유효하지 않은 URL입니다." },
        { status: 400 }
      );
    }

    // limit 유효성 검사
    if (!Number.isInteger(job_listings_limit) || job_listings_limit < 1 || job_listings_limit > 100) {
      return NextResponse.json(
        { error: "데이터 수는 1-100 사이의 정수여야 합니다." },
        { status: 400 }
      );
    }

    const payload = {
      inputParameters: {
        originUrl,
        job_listings_limit,
      },
    };

    const url = `https://api.browse.ai/v2/robots/${robotId}/tasks`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();

    // Browse.ai API 응답 데이터 콘솔 출력
    console.log('Browse.ai API 응답:', JSON.stringify(responseData, null, 2));
    
    // Task ID 특별히 강조해서 출력
    if (responseData.result && responseData.result.id) {
      console.log('🎯 생성된 Task ID:', responseData.result.id);
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: "Browse.ai API 호출 실패", details: responseData },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      data: responseData,
      taskId: responseData.result?.id || null
    });
  } catch (error) {
    console.error("스크래핑 중 오류 발생:", error);
    return NextResponse.json(
      { error: "스크래핑 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
