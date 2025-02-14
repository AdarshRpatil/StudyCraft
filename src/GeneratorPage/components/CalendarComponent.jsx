import React, { useState, useEffect, useContext } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import NavigateFirstIcon from "@mui/icons-material/FirstPage";
import NavigateLastIcon from "@mui/icons-material/LastPage";
import BlockIcon from "@mui/icons-material/Block";
import PinIcon from "@mui/icons-material/PushPin";
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import { useSnackbar } from "notistack";
import MultiLineSnackbar from "../../SiteWide/components/MultiLineSnackbar";
import IconButton from "@mui/material/IconButton";
import InfoIcon from "@mui/icons-material/Info";
import CancelIcon from "@mui/icons-material/Cancel";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

import "../css/Calendar.css";
import {
    createCalendarEvents,
    getDaysOfWeek,
    getTimeBlockEvents,
    addTimeBlockEvent,
    removeTimeBlockEvent,
    isEventPinned,
} from "../scripts/createCalendarEvents";
import { generateTimetables, getValidTimetables } from "../scripts/generateTimetables";
import { addPinnedComponent, getPinnedComponents, removePinnedComponent } from "../scripts/pinnedComponents";
import { setBlockedTimeSlots, setOpenTimeSlots } from "../scripts/timeSlots";
import { getCourseData } from "../scripts/courseData";
import { CourseDetailsContext } from "../contexts/CourseDetailsContext";
import eventBus from "../../SiteWide/Buses/eventBus";
import { Typography } from "@mui/material";

export default function CalendarComponent({
    timetables,
    setTimetables,
    selectedDuration,
    setSelectedDuration,
    durations,
    sortOption,
}) {
    const { enqueueSnackbar } = useSnackbar();
    const calendarRef = React.useRef(null);
    const [events, setEvents] = useState([]);
    const [currentTimetableIndex, setCurrentTimetableIndex] = useState(0);
    const theme = useTheme();
    const { setCourseDetails } = useContext(CourseDetailsContext);
    const [isTruncated, setIsTruncated] = useState(false);
    const [truncationDialogOpen, setTruncationDialogOpen] = useState(false);
    const [noTimetablesGenerated, setNoTimetablesGenerated] = useState(false);
    const [noTimetablesDialogOpen, setNoTimetablesDialogOpen] = useState(false);
    const [noCourses, setNoCourses] = useState(true);
    const [timeslotsOverridden, setTimeslotsOverridden] = useState(false);
    const [timeslotsOverriddenDialogOpen, setTimeslotsOverriddenDialogOpen] = useState(false);

    useEffect(() => {
        const calendarElement = document.getElementById("Calendar");
        let touchStartTimer;
        let isLongPress = false;

        const handleTouchStart = (event) => {
            touchStartTimer = setTimeout(() => {
                isLongPress = true;
                if (event.target.closest("#Calendar")) {
                    document.body.style.overflow = "hidden";
                }
            }, 500);
        };

        const handleTouchMove = (event) => {
            if (isLongPress) {
                event.preventDefault();
            }
        };

        const handleTouchEnd = () => {
            clearTimeout(touchStartTimer);
            document.body.style.overflow = "";
            isLongPress = false;
        };

        if (calendarElement) {
            calendarElement.addEventListener("touchstart", handleTouchStart, { passive: false });
            calendarElement.addEventListener("touchmove", handleTouchMove, { passive: false });
            calendarElement.addEventListener("touchend", handleTouchEnd);
            calendarElement.addEventListener("touchcancel", handleTouchEnd);
        }

        return () => {
            if (calendarElement) {
                calendarElement.removeEventListener("touchstart", handleTouchStart);
                calendarElement.removeEventListener("touchmove", handleTouchMove);
                calendarElement.removeEventListener("touchend", handleTouchEnd);
                calendarElement.removeEventListener("touchcancel", handleTouchEnd);
            }
        };
    }, []);

    useEffect(() => {
        updateCalendarEvents();
    }, [currentTimetableIndex, timetables]);

    useEffect(() => {
        if (selectedDuration) {
            handleCalendarViewClick(selectedDuration);
        }
    }, [selectedDuration]);

    useEffect(() => {
        const handleTruncation = (status) => {
            setIsTruncated(status);
        };
        eventBus.on("truncation", handleTruncation);
        return () => {
            eventBus.off("truncation", handleTruncation);
        };
    }, []);

    useEffect(() => {
        const handleTimeslotsOverridden = (status) => {
            setTimeslotsOverridden(status);
        };
        eventBus.on("overridden", handleTimeslotsOverridden);
        return () => {
            eventBus.off("overridden", handleTimeslotsOverridden);
        };
    }, []);

    const updateCalendarEvents = () => {
        if (currentTimetableIndex >= timetables.length && timetables.length > 0) {
            handleLast();
        }
        if (timetables.length > 0 && timetables[0].courses.length > 0) {
            setNoCourses(false);
            const timetable = timetables[currentTimetableIndex];
            const newEvents = createCalendarEvents(timetable, getDaysOfWeek);

            const courseDetails = newEvents
                .filter((event) => event.description)
                .map((event) => {
                    let titleArray = event.title.trim().split(" ");
                    return {
                        name: titleArray[0],
                        instructor: event.description,
                        section: titleArray.pop(),
                        startDate: event.startRecur,
                        endDate: event.endRecur,
                    };
                });

            setCourseDetails(courseDetails);
            setEvents(newEvents);
            setNoTimetablesGenerated(false);
        } else {
            setNoCourses(true);
            const newEvents = createCalendarEvents(null, getDaysOfWeek);
            setCourseDetails([]);
            setEvents(newEvents);
            if (Object.keys(getCourseData()).length > 0) {
                enqueueSnackbar(
                    <MultiLineSnackbar message="No valid timetables can be generated! Click the red 'x' icon for more information!" />,
                    {
                        variant: "error",
                    }
                );
                setNoTimetablesGenerated(true);
            }
        }
    };

    const handleCalendarViewClick = (durationLabel) => {
        const calendarApi = calendarRef.current.getApi();

        const [startUnix, endUnix, duration] = durationLabel.split("-");
        const startDate = new Date(startUnix * 1000);

        if (startDate.getDay() != 1) {
            startDate.setDate(startDate.getDate() + 7);
        }

        calendarApi.gotoDate(startDate);

        setSelectedDuration(durationLabel);
        enqueueSnackbar(
            <MultiLineSnackbar
                message={"Calendar View: " + startDate.toLocaleString("default", { month: "long", year: "numeric" })}
            />,
            {
                variant: "info",
            }
        );
    };

    const handleEventClick = (clickInfo) => {
        if (!clickInfo.event.extendedProps.isBlocked) {
            const split = clickInfo.event.title.split(" ");
            const courseCode = split[0];
            if (split[1] !== "TUT" && split[1] !== "LAB" && split[1] !== "SEM") {
                split[1] = "MAIN";
            }

            const pinnedComponents = getPinnedComponents();
            /*
            NOTE: substring(0,7) is used as ID's are 7 characters long.

            If there are multiple main components (such as two LECs) the 
            additional main components will have and index counter extension
            which is what the substring is trying to strip for the purpose
            of pinning.
            */
            if (pinnedComponents.includes(courseCode + " " + split[1] + " " + clickInfo.event.id.substring(0, 7))) {
                removePinnedComponent(courseCode + " " + split[1] + " " + clickInfo.event.id.substring(0, 7));
            } else {
                addPinnedComponent(courseCode + " " + split[1] + " " + clickInfo.event.id.substring(0, 7));
            }
        } else {
            const blockId = clickInfo.event.id.split("-")[1];
            const blockEvent = getTimeBlockEvents().find((block) => block.id === blockId);

            if (blockEvent) {
                const slotStart =
                    (parseInt(blockEvent.startTime.split(":")[0]) - 8) * 2 +
                    parseInt(blockEvent.startTime.split(":")[1]) / 30;
                const slotEnd =
                    (parseInt(blockEvent.endTime.split(":")[0]) - 8) * 2 +
                    parseInt(blockEvent.endTime.split(":")[1]) / 30;
                const slotsToUnblock = [];

                for (let i = slotStart; i < slotEnd; i++) {
                    slotsToUnblock.push(i);
                }

                const unblockedSlots = {
                    [blockEvent.daysOfWeek.trim()]: slotsToUnblock,
                };
                setOpenTimeSlots(unblockedSlots);
                removeTimeBlockEvent(blockId);
            }
        }
        setCurrentTimetableIndex(0);
        generateTimetables(sortOption);
        setTimetables(getValidTimetables());
    };

    const handleNext = () => {
        setCurrentTimetableIndex((currentTimetableIndex + 1) % timetables.length);
    };

    const handlePrevious = () => {
        setCurrentTimetableIndex((currentTimetableIndex - 1 + timetables.length) % timetables.length);
    };

    const handleFirst = () => {
        setCurrentTimetableIndex(0);
    };
    const handleLast = () => {
        setCurrentTimetableIndex(timetables.length - 1);
    };

    const handleSelect = (selectInfo) => {
        const startDateTime = new Date(selectInfo.startStr);
        const endDateTime = new Date(selectInfo.endStr);
        const startDay = startDateTime.toLocaleString("en-US", { weekday: "short" });
        const slotStart = (startDateTime.getHours() - 8) * 2 + startDateTime.getMinutes() / 30;
        const slotEnd = (endDateTime.getHours() - 8) * 2 + endDateTime.getMinutes() / 30;

        const dayMapping = {
            Mon: "M",
            Tue: "T",
            Wed: "W",
            Thu: "R",
            Fri: "F",
        };

        if (dayMapping[startDay]) {
            const slotsToBlock = [];
            for (let i = slotStart; i <= slotEnd - 1; i++) {
                slotsToBlock.push(i);
            }

            const existingBlocks = getTimeBlockEvents();
            let combinedSlotStart = slotStart;
            let combinedSlotEnd = slotEnd;
            let blocksToRemove = [];

            for (let block of existingBlocks) {
                if (block.daysOfWeek.trim() === dayMapping[startDay]) {
                    const existingStartParts = block.startTime.split(":");
                    const existingSlotStart =
                        (parseInt(existingStartParts[0]) - 8) * 2 + parseInt(existingStartParts[1]) / 30;
                    const existingEndParts = block.endTime.split(":");
                    const existingSlotEnd =
                        (parseInt(existingEndParts[0]) - 8) * 2 + parseInt(existingEndParts[1]) / 30;

                    if (!(slotStart >= existingSlotEnd || slotEnd <= existingSlotStart)) {
                        combinedSlotStart = Math.min(combinedSlotStart, existingSlotStart);
                        combinedSlotEnd = Math.max(combinedSlotEnd, existingSlotEnd);
                        blocksToRemove.push(block.id);
                    }
                }
            }

            const combinedSlots = [];
            for (let i = combinedSlotStart; i < combinedSlotEnd; i++) {
                combinedSlots.push(i);
            }

            const combinedSlotsObject = { [dayMapping[startDay]]: combinedSlots };

            setBlockedTimeSlots(combinedSlotsObject);

            for (let blockId of blocksToRemove) {
                removeTimeBlockEvent(blockId);
            }

            const blockId = Date.now().toString();
            const block = {
                id: blockId,
                daysOfWeek: dayMapping[startDay],
                startTime: `${Math.floor(combinedSlotStart / 2) + 8}:${combinedSlotStart % 2 === 0 ? "00" : "30"}`,
                endTime: `${Math.floor(combinedSlotEnd / 2) + 8}:${combinedSlotEnd % 2 === 0 ? "00" : "30"}`,
                startRecur: "1970-01-01",
                endRecur: "9999-12-31",
            };
            addTimeBlockEvent(block);
        }
        setCurrentTimetableIndex(0);
        generateTimetables(sortOption);
        setTimetables(getValidTimetables());
    };

    const handleSelectAllow = (selectionInfo) => {
        let startDate = selectionInfo.start;
        let endDate = selectionInfo.end;
        endDate.setSeconds(endDate.getSeconds() - 1);
        if (startDate.getDate() === endDate.getDate()) {
            return true;
        } else {
            return false;
        }
    };

    const handleCloseTruncationDialog = () => {
        setTruncationDialogOpen(false);
    };
    const handleCloseNoTimetablesDialog = () => {
        setNoTimetablesDialogOpen(false);
    };
    const handleCloseBlockedSlotsDialog = () => {
        setTimeslotsOverriddenDialogOpen(false);
    };

    function sortByBracketContent(arr) {
        return arr.sort((a, b) => {
            const indexA = a.indexOf("(");
            const indexB = b.indexOf("(");

            const substringA = a.slice(indexA);
            const substringB = b.slice(indexB);

            return substringA.localeCompare(substringB);
        });
    }

    const renderEventContent = (eventInfo) => {
        // Calculate the event duration in minutes
        const startTime = eventInfo.event.start;
        const endTime = eventInfo.event.end;
        const eventDuration = (endTime - startTime) / (1000 * 60); // Duration in minutes

        // Set the threshold for showing the time (90 minutes)
        const minDurationToShowTime = 90;

        if (eventInfo.event.extendedProps.isBlocked) {
            return (
                <div style={{ position: "relative", height: "100%", textAlign: "center" }}>
                    {eventDuration >= minDurationToShowTime && (
                        <div style={{ position: "absolute", top: "2px", left: "2px" }}>
                            <b>{eventInfo.timeText}</b>
                        </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                        <span style={{ fontSize: "2rem" }}>
                            <BlockIcon />
                        </span>
                    </div>
                </div>
            );
        } else {
            const isPinned = isEventPinned(eventInfo.event);

            return (
                <div
                    style={{
                        position: "relative",
                        backgroundColor: isPinned ? "rgba(0, 0, 0, 0.5)" : "transparent",
                        height: "100%",
                        padding: "2px",
                    }}
                >
                    {eventDuration >= minDurationToShowTime && (
                        <div style={{ position: "absolute", top: "2px", left: "2px" }}>
                            <b>{eventInfo.timeText}</b>
                        </div>
                    )}
                    {isPinned && (
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                position: "absolute",
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                opacity: 0.25,
                                fontSize: "4rem",
                            }}
                        >
                            <PinIcon />
                        </div>
                    )}
                    <div style={{ position: "relative", zIndex: 1 }}>
                        <b>{eventInfo.timeText}</b>
                        <br />
                        <span>{eventInfo.event.title}</span>
                        <br />
                        <span>{eventInfo.event.extendedProps.description}</span>
                    </div>
                </div>
            );
        }
    };

    return (
        <Box
            sx={{
                border: "1px solid",
                borderColor: "primary.main",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "16px",
                position: "relative",
            }}
        >
            <Box
                sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: "primary.main",
                    padding: "4px 8px",
                    color: "white",
                    fontWeight: "bold",
                    fontSize: "0.875rem",
                    borderTopLeftRadius: "8px",
                    borderTopRightRadius: "8px",
                }}
            >
                Calendar
            </Box>
            <Box sx={{ height: "26px" }} />
            <Box id="calendarNavBar" style={{ backgroundColor: theme.palette.divider }}>
                <Box id="infoButtonBox" marginLeft={1}>
                    {isTruncated && (
                        <IconButton color="warning" onClick={() => setTruncationDialogOpen(true)}>
                            <InfoIcon />
                        </IconButton>
                    )}
                    {noTimetablesGenerated && (
                        <IconButton color="error" onClick={() => setNoTimetablesDialogOpen(true)}>
                            <CancelIcon />
                        </IconButton>
                    )}
                    {timeslotsOverridden && (
                        <IconButton color="info" onClick={() => setTimeslotsOverriddenDialogOpen(true)}>
                            <InfoIcon />
                        </IconButton>
                    )}
                </Box>
                <Box id="calendarNavButtons">
                    <Box marginRight={1}>
                        <Button variant="contained" onClick={handleFirst} disabled={timetables.length <= 1}>
                            <NavigateFirstIcon />
                        </Button>
                    </Box>
                    <Box marginRight={2}>
                        <Button variant="contained" onClick={handlePrevious} disabled={timetables.length <= 1}>
                            <NavigateBeforeIcon />
                        </Button>
                    </Box>
                    <Box id="calendarTimetableNumber">
                        {currentTimetableIndex + 1} of {timetables.length}
                    </Box>
                    <Box marginLeft={2}>
                        <Button variant="contained" onClick={handleNext} disabled={timetables.length <= 1}>
                            <NavigateNextIcon />
                        </Button>
                    </Box>
                    <Box marginLeft={1}>
                        <Button variant="contained" onClick={handleLast} disabled={timetables.length <= 1}>
                            <NavigateLastIcon />
                        </Button>
                    </Box>
                </Box>
                <Box id="durationFormBox" marginRight={2}>
                    {!noCourses && (
                        <FormControl sx={{ width: 160 }} size="small">
                            <InputLabel id="duration-select-label">Duration</InputLabel>
                            <Select
                                labelId="duration-select-label"
                                id="duration-select"
                                label="Duration"
                                value={selectedDuration}
                                onChange={(e) => setSelectedDuration(e.target.value)}
                            >
                                {sortByBracketContent(durations).map((duration, index) => (
                                    <MenuItem key={index} value={duration}>
                                        {(() => {
                                            const [startUnix, endUnix, dur] = duration.split("-");
                                            const startMonth = new Date(parseInt(startUnix, 10) * 1000).toLocaleString(
                                                "default",
                                                { month: "short" }
                                            );
                                            const endMonth = new Date(parseInt(endUnix, 10) * 1000).toLocaleString(
                                                "default",
                                                { month: "short" }
                                            );
                                            return `${startMonth} - ${endMonth} (D${dur})`;
                                        })()}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                </Box>
            </Box>

            <FullCalendar
                ref={calendarRef}
                plugins={[timeGridPlugin, interactionPlugin]}
                initialView="timeGridWeek"
                weekends={false}
                headerToolbar={false}
                height={835}
                dayHeaderFormat={{ weekday: "short" }}
                dayCellClassNames={(arg) => (arg.date.getDay() === new Date().getDay() ? "fc-day-today" : "")}
                initialDate="2024-09-10"
                events={events}
                slotMinTime="08:00:00"
                slotMaxTime="23:00:00"
                slotDuration="00:30:00"
                allDaySlot={true}
                allDayText="ONLINE"
                eventContent={renderEventContent}
                eventClick={handleEventClick}
                selectable={true}
                selectMinDistance={25}
                select={handleSelect}
                selectAllow={handleSelectAllow}
                longPressDelay={0}
                selectLongPressDelay={500}
            />
            <Dialog
                open={truncationDialogOpen}
                onClose={handleCloseTruncationDialog}
                aria-labelledby="alert-dialog-title"
                aria-describedby="alert-dialog-description"
                id="truncation-dialog"
            >
                <DialogTitle id="alert-dialog-title">{"Truncated Results"}</DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-description" sx={{ mb: 2 }}>
                        The generated schedule results are truncated because the input is too broad. Some possible
                        course sections may not be shown.
                    </DialogContentText>
                    <DialogContentText>
                        To ensure all results are considered pin down some courses by clicking on them to lock them in
                        place or block out unwanted time blocks by selecting the area on the calendar prior to adding
                        more courses!
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseTruncationDialog} color="primary">
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog
                open={noTimetablesDialogOpen}
                onClose={handleCloseTruncationDialog}
                aria-labelledby="alert-dialog-title"
                aria-describedby="alert-dialog-description"
                id="no-timetables-generated-dialog"
            >
                <DialogTitle id="alert-dialog-title">{"No Timetables Generated"}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        This is likely caused by one of the following reasons:
                    </DialogContentText>
                    <DialogContentText>
                        1. Adding a course that is not being offered in that duration.
                    </DialogContentText>
                    <DialogContentText sx={{ mb: 2 }}>
                        2. Adding courses that always overlap with another course.
                    </DialogContentText>
                    <DialogContentText>
                        Try unblocking/unpinning some components or removing the last course you have added.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseNoTimetablesDialog} color="primary">
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog
                open={timeslotsOverriddenDialogOpen}
                onClose={handleCloseBlockedSlotsDialog}
                aria-labelledby="alert-dialog-title"
                aria-describedby="alert-dialog-description"
                id="blocked-slots-dialog"
            >
                <DialogTitle id="alert-dialog-title">{"Time Block Constraint Course Overlap"}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        All available options for one or more course components conflict with your current time
                        constraints, meaning the chosen class overlaps with your blocked time slots. Consequently,
                        registering for this schedule will result in a class during one of your blocked time periods.
                        Please ensure you are available for the generated timetable prior to registering.
                    </DialogContentText>
                    <DialogContentText sx={{ mb: 2 }}>To resolve this issue:</DialogContentText>
                    <DialogContentText sx={{ mb: 2 }}>
                        1. Adjust your blocked time slots: Consider unblocking certain time slots to increase scheduling
                        flexibility.
                    </DialogContentText>
                    <DialogContentText sx={{ mb: 2 }}>
                        2. Choose different courses: Look for alternative classes that do not overlap with your blocked
                        times.
                    </DialogContentText>
                    <DialogContentText>
                        Please review your schedule to ensure there are no overlapping commitments during the scheduled
                        course periods.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseBlockedSlotsDialog} color="primary">
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
