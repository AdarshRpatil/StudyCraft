/*
NOTE: This is the master timetable generation code.

It generates valid timetables for courses based on the days/times course components are offered, 
considering various constraints like blocked time slots, pinned components, and component duration.
It has a limiter/truncation system set by "maxComboThreshold" in place to avoid exponential combo growth overwhelming resources.

Key function descriptions:

 * - **timeToSlot:** Used for mapping time to "30-minute" time slot interval on the calendar for usually class times which are 8AM to 10PM. e.g: 8:00AM = slot 0, 8:30AM = slot 1, 9:00AM = slot 2
 * 
 * - **filterComponentsAgainstTimeSlots:** Filters out course components that conflict with already occupied time slots by time blocks or other components, returning those that fit within the user's schedule.
 * 
 * - **cartesianProduct:** Generates all possible combinations of given arrays, up to a specified limit to avoid overwhelming the system.
 * 
 * - **filterPinned:** Filters components based on user-pinned preferences, ensuring that only pinned components or those matching criteria are considered.
 * 
 * - **filterByDuration:** Filters out components that do not match a specified duration, used when duration constraints are applied.
 * 
 * - **generateSingleCourseCombinations:** Generates valid combinations of course components (lectures, labs, tutorials, seminars) for a single course, considering time slots, duration, and pinned preferences.
 * 
 * - **isTimetableValid:** Checks if a given timetable is valid by ensuring no overlapping schedules across different courses, considering both time slots and dates.
 * 
 * - **generateCombinationsIteratively:** Iteratively generates all possible valid timetables by combining course combinations, respecting the maximum combination threshold to avoid performance issues.
 * 
 * - **generateTimetables:** Main function that generates all valid timetables by combining course schedules, filtering by constraints, and checking for timetable validity. It also handles cases where all options are blocked by user constraints, selecting the least conflicting option.
 * 
 * - **getValidTimetables:** Returns the list of valid timetables generated by the `generateTimetables` function.
 * 
*/
import { getCourseData } from "./courseData";
import { getTimeSlots } from "./timeSlots";
import { getPinnedComponents } from "./pinnedComponents";
import eventBus from "../../SiteWide/Buses/eventBus";
import ReactGA from "react-ga4";

let validTimetables = [];
const maxComboThreshold = 50000; // Maximum number of possible combinations that can be generated.
let timeslotOverridden = false;

const timeToSlot = (time) => {
    const [hours, minutes] =
        time.length === 3
            ? [parseInt(time[0]), parseInt(time[1] + "0")]
            : [parseInt(time.slice(0, 2)), parseInt(time.slice(2))];
    return (hours - 8) * 2 + (minutes === 30 ? 1 : 0);
};

const filterComponentsAgainstTimeSlots = (components, timeSlots) => {
    const isSlotAvailable = (day, startSlot, endSlot) => {
        for (let i = startSlot; i < endSlot; i++) {
            if (timeSlots[day][i]) return false;
        }
        return true;
    };

    const calculateBlockedPercentage = (component) => {
        const { days, time } = component.schedule;
        if (!time) return 0;
        const [startSlot, endSlot] = time.split("-").map((t) => timeToSlot(t.trim()));
        const daysArray = days.replace(/\s/g, "").split("");
        const totalSlots = (endSlot - startSlot) * daysArray.length;

        let blockedCount = 0;
        for (let day of daysArray) {
            for (let i = startSlot; i < endSlot; i++) {
                if (timeSlots[day][i]) blockedCount++;
            }
        }
        return (blockedCount / totalSlots) * 100;
    };

    const groupedComponents = components.reduce((acc, component) => {
        const groupId = component.id;
        if (!acc[groupId]) acc[groupId] = [];
        acc[groupId].push(component);
        return acc;
    }, {});

    const blockedComponents = [];
    const availableGroups = [];

    for (const group of Object.values(groupedComponents)) {
        let isGroupBlocked = false;
        let blockedPercentage = 0;

        for (const component of group) {
            const { days, time } = component.schedule;
            if (!time || /[a-zA-Z]/.test(time)) continue;
            const [startSlot, endSlot] = time.split("-").map((t) => timeToSlot(t.trim()));
            const daysArray = days.replace(/\s/g, "").split("");

            for (let day of daysArray) {
                if (!isSlotAvailable(day, startSlot, endSlot)) {
                    isGroupBlocked = true;
                    blockedPercentage += calculateBlockedPercentage(component);
                    break;
                }
            }

            if (isGroupBlocked) break;
        }

        if (isGroupBlocked) {
            blockedComponents.push({ group, blockedPercentage });
        } else {
            availableGroups.push(group);
        }
    }

    if (availableGroups.length === 0 && blockedComponents.length > 0) {
        blockedComponents.sort((a, b) => a.blockedPercentage - b.blockedPercentage);
        availableGroups.push(blockedComponents[0].group);
        timeslotOverridden = true;
    }

    return availableGroups.flat();
};

const cartesianProduct = (arrays, limit) => {
    let result = [[]];
    for (const array of arrays) {
        const temp = [];
        for (const item of array) {
            for (const combination of result) {
                temp.push([...combination, item]);
                if (temp.length >= limit) {
                    eventBus.emit("truncation", true);
                    eventBus.emit("snackbar", {
                        message:
                            "The generated schedule results are truncated because the input is too broad. To ensure all results are considered pin down some courses!",
                        variant: "warning",
                    });
                    return temp;
                }
            }
        }
        result = temp;
    }
    return result;
};

const filterPinned = (components, courseCode, componentType) => {
    components.forEach((component) => (component.pinned = false));

    const pinnedComponents = getPinnedComponents();
    const coursePinnedComponents = pinnedComponents.filter((p) => {
        const [course, type] = p.split(" ");
        return course === courseCode && type === componentType;
    });

    if (!coursePinnedComponents.length) return components;

    return components.filter((component) => {
        return coursePinnedComponents.some((pinned) => {
            const [, , id] = pinned.split(" ");
            if (component.id === id) {
                component.pinned = true;
                return true;
            }
            return false;
        });
    });
};

const filterByDuration = (components, duration) => {
    return components.filter((component) => component.schedule.duration === duration);
};

const generateSingleCourseCombinations = (course, timeSlots) => {
    const pinnedComponents = getPinnedComponents();

    const durationFilter = pinnedComponents.find((p) => {
        const [pinnedCourse, type, value] = p.split(" ");
        return pinnedCourse === course.courseCode && type === "DURATION";
    });

    let validMainComponents = course.sections;
    if (durationFilter) {
        const duration = durationFilter.split(" ")[2];
        validMainComponents = filterByDuration(validMainComponents, duration);
    }

    validMainComponents = filterComponentsAgainstTimeSlots(validMainComponents, timeSlots);
    validMainComponents = filterPinned(validMainComponents, course.courseCode, "MAIN");

    const groupedMainComponents = Object.values(
        validMainComponents.reduce((acc, component) => {
            const groupId = component.id;
            if (!acc[groupId]) acc[groupId] = [];
            acc[groupId].push(component);
            return acc;
        }, {})
    );

    const validLabs = filterPinned(
        filterComponentsAgainstTimeSlots(
            durationFilter ? filterByDuration(course.labs, durationFilter.split(" ")[2]) : course.labs,
            timeSlots
        ),
        course.courseCode,
        "LAB"
    );

    const validTutorials = filterPinned(
        filterComponentsAgainstTimeSlots(
            durationFilter ? filterByDuration(course.tutorials, durationFilter.split(" ")[2]) : course.tutorials,
            timeSlots
        ),
        course.courseCode,
        "TUT"
    );

    const validSeminars = filterPinned(
        filterComponentsAgainstTimeSlots(
            durationFilter ? filterByDuration(course.seminars, durationFilter.split(" ")[2]) : course.seminars,
            timeSlots
        ),
        course.courseCode,
        "SEM"
    );

    const singleCourseCombinations = [];

    groupedMainComponents.forEach((mainComponentGroup) => {
        const mainComponentDuration = mainComponentGroup[0].schedule.duration;
        const isOnlyMainSection = validMainComponents.length === 1;

        /*
        NOTE: Certain main course components may only permit registering to certain secondary course components.
        There are cases where components such as seminars are section specific.
        
        Generally, checking if 4th/middle character in the secondary component's ID matches to the main component's ID
        is a good way to determine if the secondary component is registerable with that main component. 
        However, this does not apply if there is only one main section offered for the course.
        */

        const validLabsForMainComponent = validLabs.filter(
            (lab) =>
                lab.schedule.duration === mainComponentDuration &&
                ((isOnlyMainSection && mainComponentGroup[0].id !== "0") ||
                    lab.id.charAt(3) === mainComponentGroup[0].id.charAt(3))
        );

        const validTutorialsForMainComponent = validTutorials.filter(
            (tutorial) =>
                tutorial.schedule.duration === mainComponentDuration &&
                ((isOnlyMainSection && mainComponentGroup[0].id !== "0") ||
                    tutorial.id.charAt(3) === mainComponentGroup[0].id.charAt(3))
        );

        const validSeminarsForMainComponent = validSeminars.filter(
            (seminar) =>
                seminar.schedule.duration === mainComponentDuration &&
                ((isOnlyMainSection && mainComponentGroup[0].id !== "0") ||
                    seminar.id.charAt(3) === mainComponentGroup[0].id.charAt(3))
        );

        const pinnedLab = pinnedComponents.find((p) => p.includes("LAB") && p.split(" ")[0] === course.courseCode);
        const pinnedTut = pinnedComponents.find((p) => p.includes("TUT") && p.split(" ")[0] === course.courseCode);
        const pinnedSem = pinnedComponents.find((p) => p.includes("SEM") && p.split(" ")[0] === course.courseCode);

        const isLabValid = !pinnedLab || validLabsForMainComponent.some((lab) => lab.id === pinnedLab.split(" ")[2]);
        const isTutValid =
            !pinnedTut || validTutorialsForMainComponent.some((tut) => tut.id === pinnedTut.split(" ")[2]);
        const isSemValid =
            !pinnedSem || validSeminarsForMainComponent.some((sem) => sem.id === pinnedSem.split(" ")[2]);

        if (!isLabValid || !isTutValid || !isSemValid) return;

        const combinations = cartesianProduct(
            [
                validLabsForMainComponent.length > 0 ? validLabsForMainComponent : [null],
                validTutorialsForMainComponent.length > 0 ? validTutorialsForMainComponent : [null],
                validSeminarsForMainComponent.length > 0 ? validSeminarsForMainComponent : [null],
            ],
            maxComboThreshold
        );

        combinations.forEach(([lab, tutorial, seminar]) => {
            singleCourseCombinations.push({
                courseCode: course.courseCode,
                mainComponents: mainComponentGroup,
                secondaryComponents: { lab, tutorial, seminar },
            });
        });
    });

    return singleCourseCombinations;
};

const isTimetableValid = (timetable) => {
    const occupiedSlots = {};

    const overlap = (start1, end1, start2, end2) => start1 < end2 && start2 < end1;

    for (const course of timetable) {
        const components = [
            ...course.mainComponents,
            course.secondaryComponents.lab,
            course.secondaryComponents.tutorial,
            course.secondaryComponents.seminar,
        ].filter(Boolean);

        for (const component of components) {
            const { days, time, startDate, endDate } = component.schedule;
            if (!time || /[a-zA-Z]/.test(time)) continue;
            const [startSlot, endSlot] = time.split("-").map((t) => timeToSlot(t.trim()));
            const daysArray = days.split(" ").filter((day) => day);

            for (const day of daysArray) {
                for (let i = startSlot; i < endSlot; i++) {
                    if (!occupiedSlots[day]) occupiedSlots[day] = {};
                    for (const [existingStartDate, existingEndDate] of Object.keys(occupiedSlots[day]).map((d) =>
                        d.split("-").map(Number)
                    )) {
                        if (
                            overlap(startDate, endDate, existingStartDate, existingEndDate) &&
                            occupiedSlots[day][`${existingStartDate}-${existingEndDate}`].includes(i)
                        ) {
                            return false;
                        }
                    }
                    if (!occupiedSlots[day][`${startDate}-${endDate}`])
                        occupiedSlots[day][`${startDate}-${endDate}`] = [];
                    occupiedSlots[day][`${startDate}-${endDate}`].push(i);
                }
            }
        }
    }

    return true;
};

const generateCombinationsIteratively = (courseCombinations, maxCombinations) => {
    let results = [];
    let count = 0;

    const generate = (prefix, arrays) => {
        if (arrays.length === 0) {
            results.push(prefix);
            count++;
            if (count >= maxCombinations) {
                eventBus.emit("truncation", true);
                eventBus.emit("snackbar", {
                    message:
                        "The generated schedule results are truncated! Click the yellow '!' icon for more information!",
                    variant: "warning",
                });
                ReactGA.event({
                    category: "Generator Event",
                    action: "Truncation",
                });
                return false;
            }
            eventBus.emit("truncation", false);
            return true;
        }

        const [first, ...rest] = arrays;
        for (const item of first) {
            if (!generate([...prefix, item], rest)) return false;
        }
        return true;
    };

    generate([], courseCombinations);
    return results;
};

const calculateWaitingTime = (timetable) => {
    let totalWaitingTime = 0;
    const daySlots = {};

    timetable.forEach((course) => {
        const components = [
            ...course.mainComponents,
            course.secondaryComponents.lab,
            course.secondaryComponents.tutorial,
            course.secondaryComponents.seminar,
        ].filter(Boolean);

        components.forEach((component) => {
            const { days, time } = component.schedule;
            if (!time || /[a-zA-z]/.test(time)) return;
            const [startSlot, endSlot] = time.split("-").map((t) => timeToSlot(t.trim()));
            const daysArray = days.split(" ").filter((day) => day);

            daysArray.forEach((day) => {
                if (!daySlots[day]) daySlots[day] = [];
                daySlots[day].push({ startSlot, endSlot });
            });
        });
    });

    Object.values(daySlots).forEach((slots) => {
        slots.sort((a, b) => a.startSlot - b.startSlot);
        for (let i = 1; i < slots.length; i++) {
            totalWaitingTime += (slots[i].startSlot - slots[i - 1].endSlot) * 30; // Convert slots to minutes
        }
    });

    return totalWaitingTime;
};

const calculateClassDays = (timetable) => {
    const daysWithClasses = new Set();

    timetable.forEach((course) => {
        const components = [
            ...course.mainComponents,
            course.secondaryComponents.lab,
            course.secondaryComponents.tutorial,
            course.secondaryComponents.seminar,
        ].filter(Boolean);

        components.forEach((component) => {
            const { days } = component.schedule;
            if (!days) return;
            const daysArray = days.split(" ").filter((day) => day);
            daysArray.forEach((day) => daysWithClasses.add(day));
        });
    });

    return daysWithClasses.size;
};

export const generateTimetables = (sortOption) => {
    eventBus.emit("overridden", false);
    timeslotOverridden = false;
    validTimetables = [];
    const courseData = getCourseData();
    const courses = Object.values(courseData);
    const timeSlots = getTimeSlots();

    const allCourseCombinations = courses.map((course) => generateSingleCourseCombinations(course, timeSlots));

    if (allCourseCombinations.some((combinations) => combinations.length === 0)) {
        validTimetables.push({ courses: [] });
        return;
    }

    let allPossibleTimetables = generateCombinationsIteratively(allCourseCombinations, maxComboThreshold);

    allPossibleTimetables.forEach((timetable) => {
        if (isTimetableValid(timetable)) {
            validTimetables.push({ courses: timetable });
        }
    });

    if (sortOption === "sortByWaitingTime") {
        validTimetables.sort((a, b) => {
            const waitingTimeDiff = calculateWaitingTime(a.courses) - calculateWaitingTime(b.courses);
            if (waitingTimeDiff !== 0) {
                return waitingTimeDiff;
            }
            return calculateClassDays(a.courses) - calculateClassDays(b.courses);
        });
    } else if (sortOption === "minimizeClassDays") {
        validTimetables.sort((a, b) => calculateClassDays(a.courses) - calculateClassDays(b.courses));
    }

    if (timeslotOverridden) {
        eventBus.emit("overridden", true);
        eventBus.emit("snackbar", {
            message:
                "All available options for one or more course components are partially or fully blocked by your time constraints. As a result the best available option with the least time-block overlap has been selected.",
            variant: "warning",
        });
    }
};

export const getValidTimetables = () => validTimetables;
