import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const apiKey = process.env.BROWSE_API_KEY;
    const robotId = process.env.ROBOT_ID;
    const taskId = params.taskId;

    if (!apiKey || !robotId) {
      return NextResponse.json(
        { error: "API 키 또는 로봇 ID가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    if (!taskId) {
      return NextResponse.json(
        { error: "Task ID가 필요합니다." },
        { status: 400 }
      );
    }

    const url = `https://api.browse.ai/v2/robots/${robotId}/tasks/${taskId}`;

    console.log("🔍 Task 데이터 요청 URL:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const responseData = await response.json();

    // Browse.ai API 응답 데이터 콘솔 출력
    console.log(
      "Browse.ai Task 데이터 응답:",
      JSON.stringify(responseData, null, 2)
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Browse.ai API 호출 실패", details: responseData },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      data: responseData,
      taskId: taskId,
    });
  } catch (error) {
    console.error("Task 데이터 가져오기 중 오류 발생:", error);
    return NextResponse.json(
      { error: "Task 데이터를 가져오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
